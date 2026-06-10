# Design: Mambru — Versatile Desktop Assistant (v1)

## Technical Approach

Tauri v2 (Rust) + Svelte with hexagonal architecture. Domain logic lives in isolated Rust modules (`llm`, `voice`, `tools`, `conversation`, `config`) behind trait boundaries. Tauri IPC commands bridge UI ↔ backend as thin adapters. Streaming uses Tauri event emission (SSE pattern). Security via Tauri capabilities + custom `RiskClassifier`.

Stack rationale per exploration.md: Rust for audio/LLM/security, Svelte for reactive chat UI, Tauri v2 for smallest bundle + best security model.

## Architecture Decisions

### Decision: LLMProvider trait over enum dispatch
| Option | Tradeoff | Choice |
|--------|----------|--------|
| Enum dispatch | Match arms per provider, harder to extend | |
| Trait objects | Dynamic dispatch cost, but open for new providers | **Yes** |
**Rationale**: A trait lets users add providers without modifying the core — aligns with hexagonal ports/adapters.

### Decision: Tauri events for streaming (not WebSocket or custom channel)
| Option | Tradeoff | Choice |
|--------|----------|--------|
| WebSocket | Overkill, extra port, serialization overhead | |
| Tauri events | Built-in, works with IPC invoke lifecycle | **Yes** |
**Rationale**: `app_handle.emit("llm:token", payload)` maps directly to `listen("llm:token", cb)` in Svelte. No extra infra, cancellation via `unlisten()`.

### Decision: Push-to-talk only (no always-listening in v1)
**Rationale**: Voice threading complexity is the #1 risk (proposal). PTT avoids VAD state machine, buffer management, false positives, and battery drain. VAD for silence trimming only — not wake-word detection.

### Decision: TOML for both settings and commands
**Rationale**: TOML is the most human-editable structured format. Users can tweak `~/.config/mambru/commands.toml` in a text editor without touching JSON. Serde support is first-class.

### Decision: Three-tier risk classification, not binary
**Rationale**: Binary safe/dangerous forces users to choose between annoyance and risk. Three tiers (auto / confirm / approve+preview) let the user calibrate trust per command.

## Data Flow

### Chat Flow
```
Svelte input → invoke("send_message", { text })
  → Rust IPC handler (commands/chat.rs)
  → LLMProvider::chat(messages) → Stream<Delta>
  → for each delta: app_handle.emit("llm:token", delta)
  → Svelte listen("llm:token") → append to MessageBubble
  → Stream end → emit("llm:done")
```

### Voice Flow
```
PTT hold → cpal capture (100ms chunks)
  → Silero VAD trims silence
  → PTT release → whisper.cpp transcribe
  → transcribed text injected as user message
  → normal chat flow → TTS on response end
  → Piper TTS → rodio playback
```

### Command Flow
```
User message → CommandRegistry::match(text)
  → regex match + param extraction
  → RiskClassifier::classify(command.risk)
  → if medium: emit("cmd:confirm") → await user response
  → if dangerous: emit("cmd:preview") → await approval
  → Executor::execute(action, params)
  → tauri-plugin-shell → audit log
  → result back to chat
```

### Search Flow
```
LLM determines search needed
  → ToolCall::Search(query)
  → reqwest → Tavily/SerpAPI
  → results injected as context into LLM
  → LLM summarizes → stream to chat
```

## Interfaces / Contracts

```rust
// Core trait — every provider implements this
#[async_trait]
trait LLMProvider: Send + Sync {
    async fn chat(
        &self,
        messages: Vec<Message>,
        cancel: CancellationToken,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<Delta>> + Send>>>;

    fn config(&self) -> ProviderConfig;
}

// Command registry — matches + executes
struct CommandRegistry {
    commands: Vec<Command>,
}
impl CommandRegistry {
    fn match_msg(&self, text: &str) -> Option<Match>;
    async fn execute(match: Match) -> Result<ExecResult>;
}

// Risk classification
enum RiskTier { Safe, Medium, Dangerous }

struct RiskClassifier;
impl RiskClassifier {
    fn classify(cmd: &Command) -> RiskTier;
    fn validate_args(cmd: &Command, params: &[String]) -> Result<()>;
}

// IPC command signatures (Tauri)
#[tauri::command]
async fn send_message(app: AppHandle, state: State<'_, AppState>, text: String) -> Result<()>;

#[tauri::command]
async fn set_settings(state: State<'_, AppState>, settings: Settings) -> Result<()>;

#[tauri::command]
async fn start_voice_capture(app: AppHandle, state: State<'_, AppState>) -> Result<()>;

#[tauri::command]
async fn stop_voice_capture(state: State<'_, AppState>) -> Result<String>;

#[tauri::command]
async fn get_commands(state: State<'_, AppState>) -> Result<Vec<Command>>;

#[tauri::command]
async fn save_command(state: State<'_, AppState>, cmd: Command) -> Result<()>;
```

## File Changes (all new — greenfield)

| File | Action | Description |
|------|--------|-------------|
| `src-tauri/Cargo.toml` | Create | Dependencies: tauri v2, serde, reqwest, tokio, llm, whisper-rs, piper-rs, cpal, rodio, notify |
| `src-tauri/tauri.conf.json` | Create | App metadata, window config, capability permissions |
| `src-tauri/src/main.rs` | Create | Tauri entry: plugin registration, state init, invoke handlers |
| `src-tauri/src/llm/mod.rs` | Create | LLMProvider trait, runtime, provider factory |
| `src-tauri/src/llm/provider.rs` | Create | ProviderConfig, stream types, Delta struct |
| `src-tauri/src/llm/ollama.rs` | Create | OllamaProvider via ollama-rs HTTP client |
| `src-tauri/src/llm/openai.rs` | Create | CloudProvider for OpenAI/Anthropic via `llm` crate |
| `src-tauri/src/voice/mod.rs` | Create | VoicePipeline struct: capture → VAD → STT → TTS |
| `src-tauri/src/voice/stt.rs` | Create | whisper.cpp binding, transcription |
| `src-tauri/src/voice/vad.rs` | Create | Silero VAD for silence trimming |
| `src-tauri/src/voice/tts.rs` | Create | Piper TTS generation + rodio playback |
| `src-tauri/src/tools/mod.rs` | Create | Tool definitions, ToolCall enum |
| `src-tauri/src/tools/executor.rs` | Create | Shell exec via tauri-plugin-shell, result capture |
| `src-tauri/src/tools/search.rs` | Create | Tavily/SerpAPI client with reqwest |
| `src-tauri/src/tools/commands/mod.rs` | Create | Command type, serialization structs |
| `src-tauri/src/tools/commands/registry.rs` | Create | Load/save/reload commands.toml, file watcher |
| `src-tauri/src/tools/commands/matcher.rs` | Create | Regex trigger matching, named param extraction |
| `src-tauri/src/tools/commands/builder.rs` | Create | AI-assisted command creation from NL |
| `src-tauri/src/security/classifier.rs` | Create | RiskTier enum, classify(), validate_args() |
| `src-tauri/src/security/audit.rs` | Create | Append-only audit log to JSON |
| `src-tauri/src/conversation/history.rs` | Create | In-memory Vec + JSON file persistence |
| `src-tauri/src/conversation/personality.rs` | Create | System prompt management, presets |
| `src-tauri/src/config/settings.rs` | Create | Settings struct, serde TOML load/save |
| `src-tauri/src/commands/chat.rs` | Create | send_message, cancel, get_history IPC handlers |
| `src-tauri/src/commands/voice.rs` | Create | start/stop capture, get_voice_status handlers |
| `src-tauri/src/commands/settings.rs` | Create | get/set settings, get_command_list IPC |
| `src/App.svelte` | Create | Root layout with Chat + Settings toggle |
| `src/lib/components/Chat.svelte` | Create | Message list, input, streaming render |
| `src/lib/components/MessageBubble.svelte` | Create | Markdown rendering with rehype + highlight.js |
| `src/lib/components/VoiceControls.svelte` | Create | PTT button, recording indicator |
| `src/lib/components/Settings.svelte` | Create | Multi-tab settings panel (provider, voice, commands, personality, theme) |
| `src/lib/components/ConfirmationDialog.svelte` | Create | Modal for medium/dangerous command approval |
| `src/lib/stores/conversation.ts` | Create | Svelte writable store for messages, active conversation |
| `src/lib/stores/settings.ts` | Create | Reactive settings store, auto-save |
| `src/lib/stores/voice.ts` | Create | Recording state, audio level indicator |
| `src/lib/api/llm.ts` | Create | invoke("send_message"), listen("llm:token") wrappers |
| `src/lib/api/voice.ts` | Create | invoke("start_voice_capture"), invoke("stop_voice_capture") |
| `src/lib/api/tools.ts` | Create | invoke for command CRUD, search |
| `src/main.ts` | Create | Svelte mount point |
| `src/app.css` | Create | Base styles, theme variables |
| `package.json` | Create | Svelte, svelte-markdown, highlight.js, TypeScript deps |

## Configuration Design

Two files under `~/.config/mambru/`:

**settings.toml** — LLM provider, API keys, voice, theme, personality
```toml
[provider]
active = "ollama"  # ollama | openai | anthropic

[provider.openai]
api_key = ""
base_url = "https://api.openai.com/v1"
model = "gpt-4o"

[provider.ollama]
base_url = "http://localhost:11434"
model = "llama3"

[voice]
enabled = true
ptt_key = "V"      # virtual key code
tts_enabled = true

[appearance]
theme = "dark"     # dark | light

[personality]
preset = "default"  # default | professional | custom
custom_prompt = ""

[search]
provider = "tavily"  # tavily | serpapi
api_key = ""
```

**commands.toml** — array of user-defined commands
```toml
[[commands]]
name = "apagar monitor"
trigger = "apagá (el monitor|la pantalla)"
action = { type = "exec", command = "psshutdown.exe", args = ["-d", "-t", "00"] }
risk = "medium"
confirm = "¿Apagar el monitor?"

[[commands]]
name = "abrir app"
trigger = "abrí (?P<app>\\w+)"
action = { type = "exec", command = "start", args = ["{app}"] }
risk = "safe"
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit (Rust) | LLMProvider trait contract | Mock provider, verify stream yields expected deltas, cancellation works |
| Unit (Rust) | CommandMatcher regex + params | Table-driven tests: trigger, input, expected capture groups |
| Unit (Rust) | RiskClassifier | Each tier maps correctly, arg validation blocks shell injection patterns |
| Unit (Rust) | Settings load/save | Round-trip serde tests: valid TOML, malformed input, missing fields |
| Unit (Rust) | Personality presets | Preset switching clears custom, empty falls back to default |
| Integration | IPC commands | Tauri test harness with `tauri::test`, mock state, verify event emission |
| Integration | Voice pipeline (mock) | Feed WAV file → stub whisper → verify transcribed text appears |
| Integration | Command execution | Mock tauri-plugin-shell, verify audit log entries |
| Frontend | Svelte components | Vitest + @testing-library/svelte: Chat renders tokens, MessageBubble handles markdown, ConfirmDialog shows/hides |
| Frontend | Store behaviour | Vitest: settings persist on write, conversation maintains history |

## Open Questions

- [ ] **Whisper model download UX**: Download on first launch? Or ship with setup and prompt user? Needs bundling strategy.
- [ ] **Piper model sourcing**: Same question — download at runtime or bundle? Piper models are 10-50MB each.
- [ ] **Tauri plugin shell scope**: Exact allowlist for shell plugin in `tauri.conf.json` capabilities — needs careful definition per risk tier.

## Next Step

Ready for tasks (sdd-tasks).
