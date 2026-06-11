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

### Decision: Direct reqwest for LLM providers (not ollama-rs or llm crate)
| Option | Tradeoff | Choice |
|--------|----------|--------|
| `ollama-rs` crate | Extra dep, limited to Ollama, stale | |
| `llm` crate (0.3) | Heavy, includes model loading, not needed for API calls | |
| Direct `reqwest` | Minimal dep, full control, works for any REST API | **Yes** |
**Rationale**: Both `ollama-rs` and the `llm` crate add transitive weight and maintenance burden. Direct `reqwest` calls to Ollama/OpenAI/Anthropic APIs are simple, testable, and give complete control over the HTTP layer.

### Decision: WebRTC VAD over Silero VAD
| Option | Tradeoff | Choice |
|--------|----------|--------|
| `silero-vad-rs` | No published crate on crates.io, would need git dep | |
| `webrtc-vad` | Published crate, battle-tested, minimal API | **Yes** |
**Rationale**: Silero has no published Rust crate. `webrtc-vad` wraps Google's production VAD — proven in WebRTC. Sufficient for silence trimming in PTT mode.

### Decision: Subprocess Piper TTS (no piper-rs crate)
| Option | Tradeoff | Choice |
|--------|----------|--------|
| `piper-rs` | Does not exist on crates.io | |
| Subprocess `piper` binary | Requires binary on PATH, but no crate dependency | **Yes** |
**Rationale**: Piper TTS has no Rust crate. The subprocess approach calls the `piper` command-line tool, captures raw PCM on stdout, and wraps it in a WAV header for rodio playback. Simple, zero additional deps.

### Decision: Model download via Tauri IPC events (not bundled)
| Option | Tradeoff | Choice |
|--------|----------|--------|
| Bundle models in installer | 50-150MB per install, platform-specific packaging | |
| Download on first launch | Requires internet at first use, but smaller bundle | **Yes** |
**Rationale**: See ADR 1 in the fix-rust-backend design. Tauri IPC events for progress follow the same pattern as `llm:token` streaming.

### Decision: Local whisper-rs-sys patch for MinGW compatibility
| Option | Tradeoff | Choice |
|--------|----------|--------|
| Wait for upstream fix | Zero maintenance, no timeline | |
| Local Cargo patch | Immediate fix, must maintain fork | **Yes** |
**Rationale**: `whisper-rs-sys/build.rs` adds `/utf-8` MSVC flag unconditionally on all Windows targets. MinGW `gcc` rejects this flag. The local patch in `src-tauri/patches/whisper-rs-sys/` guards the flag with `#[cfg(not(target_env = "gnu"))]`. See fix-rust-backend design for details.

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
  → WebRTC VAD trims silence (via webrtc-vad crate)
  → PTT release → whisper.cpp transcribe (via whisper-rs crate)
  → transcribed text injected as user message
  → normal chat flow → TTS on response end
  → Piper TTS (subprocess) → rodio playback
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

### Model Download Flow
```
App startup → invoke("check_models")
  → scan {app_data_dir}/models/whisper/, {app_data_dir}/models/piper/
  → returns HashMap<ModelKind, ModelState>
  → if all Ready: normal startup
  → if any Missing: frontend shows DownloadDialog.svelte
  → user clicks Download → invoke("start_download", kind)
  → reqwest streaming GET → emit("model:progress") events
  → on complete: extract .tar.gz (Piper), verify size, emit("model:done")
  → frontend updates store → dialog closes when all done → voice enabled
```

## Interfaces / Contracts

```rust
// Core trait — every provider implements this
#[async_trait]
trait LLMProvider: Send + Sync {
    async fn chat(
        &self,
        request: ChatRequest,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<String, LlmError>> + Send>>>;

    fn name(&self) -> &'static str;
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

// Voice pipeline
enum ModelKind { Whisper, Piper }
enum ModelState { Missing, Downloading { bytes: u64, total: u64 }, Ready, Failed(String) }

#[tauri::command]
async fn check_models(app: AppHandle) -> Result<HashMap<ModelKind, ModelState>>;

#[tauri::command]
async fn start_download(app: AppHandle, kind: ModelKind) -> Result<()>;

// IPC command signatures (Tauri)
#[tauri::command]
async fn send_message(app: AppHandle, state: State<'_, AppState>, text: String) -> Result<()>;

#[tauri::command]
async fn set_settings(state: State<'_, AppState>, settings: Settings) -> Result<()>;

#[tauri::command]
async fn start_voice_capture(app: AppHandle, state: State<'_, AppState>) -> Result<()>;

#[tauri::command]
async fn stop_voice_capture(app: AppHandle, state: State<'_, AppState>) -> Result<String>;

#[tauri::command]
async fn get_commands(state: State<'_, AppState>) -> Result<Vec<Command>>;

#[tauri::command]
async fn save_command(state: State<'_, AppState>, cmd: Command) -> Result<()>;
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src-tauri/Cargo.toml` | Create | Dependencies: tauri v2, serde, reqwest, tokio, whisper-rs, webrtc-vad, cpal, rodio, notify |
| `src-tauri/tauri.conf.json` | Create | App metadata, window config, capability permissions |
| `src-tauri/build.rs` | Create | Tauri build hook |
| `src-tauri/src/main.rs` | Create | Tauri entry: plugin registration, state init, invoke handlers |
| `src-tauri/src/llm/mod.rs` | Create | LLMProvider trait, runtime, provider factory |
| `src-tauri/src/llm/provider.rs` | Create | ProviderConfig, stream types, Delta struct |
| `src-tauri/src/llm/ollama.rs` | Create | OllamaProvider via direct reqwest HTTP client |
| `src-tauri/src/llm/openai.rs` | Create | CloudProvider for OpenAI/Anthropic via direct reqwest |
| `src-tauri/src/voice/mod.rs` | Create | VoicePipeline struct: capture → VAD → STT → TTS |
| `src-tauri/src/voice/stt.rs` | Create | whisper.cpp binding via whisper-rs, transcription |
| `src-tauri/src/voice/vad.rs` | Create | WebRTC VAD for silence trimming (via webrtc-vad crate) |
| `src-tauri/src/voice/tts.rs` | Create | Piper TTS (subprocess) generation + rodio playback |
| `src-tauri/src/voice/download.rs` | Create | Model download module: check_models, start_download, progress events, tar.gz extraction |
| `src-tauri/src/tools/mod.rs` | Create | Tool definitions, ToolCall enum, SearchResult struct |
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
| `src/lib/components/DownloadDialog.svelte` | Create | Modal for model download on first launch |
| `src/lib/stores/conversation.ts` | Create | Svelte writable store for messages, active conversation |
| `src/lib/stores/settings.ts` | Create | Reactive settings store, auto-save |
| `src/lib/stores/voice.ts` | Create | Recording state, audio level indicator |
| `src/lib/stores/models.ts` | Create | Model state store, listen for model:progress/model:done |
| `src/lib/api/llm.ts` | Create | invoke("send_message"), listen("llm:token") wrappers |
| `src/lib/api/voice.ts` | Create | invoke("start_voice_capture"), invoke("stop_voice_capture") |
| `src/lib/api/tools.ts` | Create | invoke for command CRUD, search |
| `src/lib/api/models.ts` | Create | invoke("check_models"), invoke("start_download") wrappers |
| `src/main.ts` | Create | Svelte mount point |
| `src/app.css` | Create | Base styles, theme variables |
| `package.json` | Create | Svelte, svelte-markdown, highlight.js, TypeScript deps |

## Key Crates

| Crate | Version | Purpose |
|-------|---------|---------|
| `whisper-rs` | 0.16 (patched) | Whisper.cpp bindings for local STT |
| `webrtc-vad` | =0.4.10 | Voice activity detection for silence trimming |
| `cpal` | 0.15 | Cross-platform audio capture |
| `rodio` | 0.19 | Audio playback for TTS output |
| `reqwest` | 0.12 | HTTP client for LLM APIs, model download, web search |
| `tar` | 0.4 | Archive extraction for Piper model `.tar.gz` |
| `flate2` | 1 | Gzip decompression for model archives |
| `tauri` | 2 | Desktop app framework |
| `serde` / `toml` | 1 / 0.8 | Configuration serialization |

> **Note**: `whisper-rs` and `whisper-rs-sys` are locally patched via `[patch.crates-io]` in `Cargo.toml` for MinGW GCC compatibility. See the "Local whisper-rs-sys patch for MinGW compatibility" ADR above.

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

## Model Download

On first launch, the app checks for Whisper and Piper models in `{app_data_dir}/models/`. If any are missing, the frontend shows a `DownloadDialog.svelte` modal listing each missing model with name, size, and status. The user can click "Download" to start sequential downloads with per-model progress, or "Skip — text only" to proceed without voice features. Download uses `reqwest` streaming, emits `model:progress` and `model:done` Tauri events, and extracts `.tar.gz` archives for Piper models. If a download fails, a retry option is shown per model. Partial files are cleaned up on cancel. Voice features degrade gracefully: missing Whisper hides the mic icon, missing Piper disables TTS. The dialog can be re-opened from Settings at any time.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit (Rust) | LLMProvider trait contract | Mock provider, verify stream yields expected deltas, cancellation works |
| Unit (Rust) | CommandMatcher regex + params | Table-driven tests: trigger, input, expected capture groups |
| Unit (Rust) | RiskClassifier | Each tier maps correctly, arg validation blocks shell injection patterns |
| Unit (Rust) | Settings load/save | Round-trip serde tests: valid TOML, malformed input, missing fields |
| Unit (Rust) | Personality presets | Preset switching clears custom, empty falls back to default |
| Unit (Rust) | Model state management | ModelKind/ModelState round-trip, state transitions |
| Integration | IPC commands | Tauri test harness with `tauri::test`, mock state, verify event emission |
| Integration | Voice pipeline (mock) | Feed WAV file → stub whisper → verify transcribed text appears |
| Integration | Command execution | Mock tauri-plugin-shell, verify audit log entries |
| Integration | Model download | Mock reqwest response, verify progress/done events |
| Frontend | Svelte components | Vitest + @testing-library/svelte: Chat renders tokens, MessageBubble handles markdown, ConfirmDialog shows/hides, DownloadDialog progress updates |
| Frontend | Store behaviour | Vitest: settings persist on write, conversation maintains history, model state reacts to events |

## Open Questions (Resolved)

- [x] **Whisper model download UX**: **Resolved** — Download on first launch via Tauri IPC events with progress. Not bundled. Models stored under `{app_data_dir}/models/whisper/`. See model-download spec and fix-rust-backend design for details.
- [x] **Piper model sourcing**: **Resolved** — Same first-launch download pattern. Piper models extracted from `.tar.gz` to `{app_data_dir}/models/piper/`. Models are 10-50MB, downloaded on demand.
- [x] **Tauri plugin shell scope**: **Resolved** — The shell plugin allowlist is defined per-command risk tier in `tauri.conf.json` capabilities. Medium commands require confirmation through `ConfirmationDialog`, dangerous commands require approval+preview. No unrestricted shell access.

## Next Step

Ready for tasks (sdd-tasks).
