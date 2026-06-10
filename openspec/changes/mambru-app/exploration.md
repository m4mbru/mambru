# Exploration: Mambru Desktop Assistant Architecture

## Current State

Brand new project — zero files. The `openspec/config.yaml` already exists with basic project context. The user wants a **native desktop assistant** with hybrid LLM (local + cloud), voice I/O, file system access, web browsing, and a sarcastic/humorous personality.

---

## Approaches

### A. Desktop Framework

#### 1. Tauri v2 (RECOMMENDED)
Rust backend + system WebView frontend (WebView2 on Windows).

| Pros | Cons |
|------|------|
| Tiny binaries (3-5 MB) | UI is web-based (not pure native widgets) |
| Rust backend = full system access via IPC | WebView2 runtime required (pre-installed on Win 11 / Edge) |
| Built-in permission/capability system for security | Audio capture needs custom Rust or WebRTC |
| Shell plugin for managed command execution | |
| Official plugins: FS, HTTP, shell, clipboard, dialog, notifications | |
| Cross-platform (Windows, macOS, Linux) | |
| Mature ecosystem (Tauri v2 stable since 2024) | |
| Active community, strong documentation | |

**Frontend options**: React (largest ecosystem, best for chat UIs), Svelte (smaller bundles, simpler), or Vue. **Recommendation: Svelte** — smallest bundle, least overhead, excellent reactivity model for streaming LLM responses.

#### 2. WinUI 3 / .NET MAUI
Native Windows UI framework via C# / .NET.

| Pros | Cons |
|------|------|
| True native Fluent Design UI | Windows-only (MAUI is cross-platform but immature) |
| Direct Win32 API access | Larger bundles (200+ MB with .NET runtime) |
| XAML-based (mature tooling) | LLM/voice integration less natural in C# ecosystem |
| .NET ecosystem | Tighter coupling to Microsoft toolchain |

#### 3. egui / Iced (Pure Rust GUI)
Fully native Rust rendering, no web technology.

| Pros | Cons |
|------|------|
| Pure Rust, no web tech | Immature for complex chat UIs |
| Tiny binaries | Limited widget libraries for chat/multimedia |
| Full control over rendering | Accessibility poor |
| Good for developer tools | High development effort for polished UI |

**Verdict**: Tauri v2 is the clear winner. It gives you Rust's power for the backend (LLM, voice, system access) while letting you build a rich chat UI with standard web tech. Bundle size, security model, and ecosystem are all best-in-class.

---

### B. LLM Layer

#### 1. Ollama for local + Direct API for cloud (RECOMMENDED)
Ollama provides a local HTTP API (OpenAI-compatible) that Rust can call via `ollama-rs` crate (1k+ stars, active) or raw HTTP. For cloud, use the `llm` Rust crate (unifies OpenAI, Anthropic, DeepSeek, Google, Groq under one trait).

| Pros | Cons |
|------|------|
| Single Rust crate (`llm`) covers 10+ providers | Two code paths to maintain (local vs cloud) |
| Ollama manages model download/quantization | Ollama requires separate install (user must install) |
| OpenAI-compatible format = consistent interface | |
| Streaming support via SSE in both paths | |

**Code structure**:
```rust
trait LLMProvider {
    async fn chat(&self, messages: &[Message]) -> Result<Stream<Delta>>;
}

struct OllamaProvider { /* via ollama-rs */ }
struct OpenAIProvider { /* via llm crate */ }
struct AnthropicProvider { /* via llm crate */ }
```

#### 2. Litellm proxy
Run Litellm as a local proxy that routes to any provider (including Ollama).

| Pros | Cons |
|------|------|
| Single OpenAI-compatible endpoint for everything | Adds a Python dependency (another process to run) |
| Built-in cost tracking, failover | Overkill for a desktop app |
| | Latency overhead from proxy hop |

**Verdict**: Build a thin abstraction layer in Rust. Direct integration with Ollama for local, native SDK calls for cloud. The `llm` crate already provides this unified interface.

---

### C. Voice Pipeline

```
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│Microphone│───▶│   VAD   │───▶│   STT   │───▶│  LLM    │
│  input   │    │(Silero) │    │(Whisper)│    │         │
└─────────┘    └─────────┘    └─────────┘    └────┬────┘
                                                  │
┌─────────┐    ┌─────────┐                       │
│Speaker  │◀───│   TTS   │◀──────────────────────┘
│ output  │    │(Piper)  │
└─────────┘    └─────────┘
```

#### STT: whisper.cpp via `whisper-rs` (Rust bindings)
- Local, fast with quantized models (tiny = 75MB, base = 142MB)
- Streaming via overlapping 30-second windows
- Fallback: OpenAI Whisper API / Deepgram for cloud

#### VAD: Silero VAD
- Best accuracy, Rust bindings available
- Supports push-to-talk and always-listening modes
- Lightweight (< 10MB model)

#### TTS: Piper TTS
- Local neural TTS, optimized for CPU
- Rust bindings available (`piper-rs`, `piper-tts-rs`)
- Multiple voices/languages
- Quality: good, not on par with ElevenLabs
- Fallback: ElevenLabs API, OpenAI TTS, or OS TTS (SAPI on Windows)

**Real-time architecture**:
- Stream audio from mic in 100ms chunks
- VAD processes each chunk (probability threshold)
- On speech end: send accumulated audio to Whisper
- Whisper returns text → feeds to LLM
- LLM response streams → TTS generates audio in parallel
- Play audio through OS audio device (cpal or rodio crate)

---

### D. Command Execution & Security

#### Approach: Tauri Shell Plugin + User Confirmation Gate (RECOMMENDED)

Tauri v2's shell plugin provides:
- **Allowlist-based**: define exact commands and argument patterns that can be executed
- **Capability system**: granular permissions per command/scope
- **Sidecar support**: ship trusted binaries alongside the app

**Security model**:
1. Classify operations by risk level:
   - **Safe** (read file, search web) — auto-execute
   - **Medium** (write file, execute known command) — user confirmation via dialog
   - **Dangerous** (run shell script, modify system, install software) — require explicit user approval + show command preview
2. Pattern-match arguments with regex validators
3. Maintain audit log of all executed commands

Example capability config:
```json
{
  "identifier": "shell:allow-execute",
  "allow": [
    { "name": "exec-sh", "cmd": "sh", "args": [
      "-c", { "validator": "\\S+" }
    ], "sidecar": false }
  ]
}
```

---

### E. Internet Access

**Simple HTTP**: `reqwest` crate for REST APIs, search APIs (Tavily, SerpAPI), direct web scraping of non-JS pages.

**JS-rendered pages**: `chromiumoxide` or `headless_chrome` Rust crate — drives headless Chrome via CDP. Bundles its own Chromium binary on first run.

**Emerging option**: `Obscura` — new Rust-native headless browser (30MB memory, 85ms page load) but early stage. Worth watching, not ready for production yet.

**Search workflow**: User asks query → AI decides to search → call Tavily/SerpAPI → get results → LLM summarizes → respond.

---

### F. Custom Command/Skills System

Mambru needs a **user-definable command system** — the user can create, edit, and delete custom voice/text commands without touching code.

#### How it would work

```
User: "Mambru, apagá el monitor"
Mambru: matches command "apagá el monitor" → executes "psshutdown.exe -d -t 00"
```

#### Command Registry

Each command has:
- **Trigger**: natural language phrase or regex pattern
- **Action**: shell command, script, API call, or sequence of actions
- **Parameters**: named slots extracted from the trigger (e.g., `{filename}`, `{url}`)
- **Risk level**: safe / medium / dangerous (maps to security gates)
- **Confirmation message**: custom message shown before execution (optional)
- **Icon/emoji**: for UI display

Example config stored in `~/.config/mambru/commands.toml`:

```toml
[[commands]]
trigger = "apagá (el monitor|la pantalla)"
action = { type = "exec", command = "psshutdown.exe", args = ["-d", "-t", "00"] }
risk = "medium"
confirm = "¿Apagar el monitor?"

[[commands]]
trigger = "abrí {app}"
action = { type = "exec", command = "start", args = ["{app}"] }
risk = "safe"

[[commands]]
trigger = "bajame los videos de {url}"
action = { type = "script", path = "~/.mambru/scripts/yt-dlp.sh", args = ["{url}"] }
risk = "dangerous"
confirm = "¿Descargar videos de {url}?"
```

#### UI for Command Management

- **Command Manager** panel in settings: list, search, filter
- **Inline creation**: "Mambru, acordate que cuando diga X hagas Y" — AI creates the command and asks for confirmation
- **Import/Export**: share command packs as TOML/JSON files
- **Macro editor**: visual builder for multi-step commands

#### Enabling via AI

The user can create commands conversationally:
- User: "Mambru, cuando te diga 'modo cine' cerrá las persianas y poné la tele"
- Mambru: "¿Creo el comando 'modo cine' → ejecuta scripts/persianas.bat + enciende TV? (riesgo: medio)"
- User: "Dale"
- Mambru: "✅ Comando 'modo cine' creado. Decímelo cuando quieras."

#### Storage & Sync

- Local file: `~/.config/mambru/commands.toml`
- Commands are just TOML — user can edit manually, version-control, or share
- Future: optional cloud sync via GitHub Gist or similar

---

### G. Project Structure (Hexagonal Architecture)

```
mambru/
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── main.rs         # Tauri entry point
│   │   ├── commands/       # Tauri IPC commands (UI bridge)
│   │   ├── llm/            # LLM abstraction layer
│   │   │   ├── mod.rs
│   │   │   ├── provider.rs # LLMProvider trait
│   │   │   ├── ollama.rs
│   │   │   ├── openai.rs
│   │   │   └── anthropic.rs
│   │   ├── voice/          # Voice pipeline
│   │   │   ├── mod.rs
│   │   │   ├── stt.rs      # Speech-to-text (whisper)
│   │   │   ├── vad.rs      # Voice activity detection
│   │   │   └── tts.rs      # Text-to-speech (piper)
│   │   ├── tools/          # Tool/plugin system
│   │   │   ├── mod.rs
│   │   │   ├── executor.rs # Command execution with security
│   │   │   ├── filesystem.rs
│   │   │   ├── web.rs      # HTTP + headless browser
│   │   │   ├── search.rs   # Search API integration
│   │   │   └── commands/   # User-defined custom command system
│   │   │       ├── mod.rs
│   │   │       ├── registry.rs  # Load/save commands.toml
│   │   │       ├── matcher.rs   # NL trigger matching + param extraction
│   │   │       └── builder.rs   # AI-assisted command creation
│   │   ├── security/       # Permission gates
│   │   │   ├── mod.rs
│   │   │   ├── classifier.rs
│   │   │   └── audit.rs
│   │   ├── conversation/   # Conversation management
│   │   │   ├── mod.rs
│   │   │   ├── history.rs
│   │   │   └── personality.rs # System prompt management
│   │   └── config/         # App configuration
│   │       ├── mod.rs
│   │       └── settings.rs
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/                    # Frontend (Svelte)
│   ├── App.svelte
│   ├── lib/
│   │   ├── components/
│   │   │   ├── Chat.svelte
│   │   │   ├── MessageBubble.svelte
│   │   │   ├── VoiceControls.svelte
│   │   │   ├── Settings.svelte
│   │   │   └── ConfirmationDialog.svelte
│   │   ├── stores/
│   │   │   ├── conversation.ts
│   │   │   ├── settings.ts
│   │   │   └── voice.ts
│   │   └── api/           # Tauri invoke wrappers
│   │       ├── llm.ts
│   │       ├── voice.ts
│   │       └── tools.ts
│   ├── main.ts
│   └── app.css
├── package.json
├── openspec/
│   └── changes/
│       └── mambru-app/
│           └── exploration.md
└── README.md
```

---

## Recommendation

**Stack**: Tauri v2 (Rust backend) + Svelte (frontend)

**Rationale**:
1. **Rust** gives you C-level performance for audio processing, LLM inference management, and system calls — all in a memory-safe language
2. **Tauri v2** provides the most mature security model (capabilities, shell allowlists, permission system) which maps directly to the "layered security" requirement
3. **Svelte** is the ideal frontend for a chat app — minimal overhead, excellent reactivity for streaming text, tiny bundles
4. The **plugin ecosystem** (shell, fs, http, dialog, notifications) covers 80% of what Mambru needs out of the box
5. Voice pipeline all has Rust-native or Rust-bindable libraries (whisper.cpp, Silero VAD, Piper TTS)
6. LLM integration is well-served by Rust crates (`llm` crate, `ollama-rs`)
7. Bundle size stays under 10MB, making it practical for distribution

**Key crates**:
- `tauri` v2 + `tauri-plugin-shell` + `tauri-plugin-fs` + `tauri-plugin-dialog`
- `whisper-rs` (bindings to whisper.cpp)
- `piper-rs` (Piper TTS)
- `silero-vad-rs` or custom WebRTC VAD binding
- `llm` (unified multi-provider LLM client)
- `reqwest` (HTTP client)
- `headless_chrome` or `chromiumoxide` (headless browsing)
- `cpal` + `rodio` (audio capture/playback)
- `serde` + `serde_json` (serialization)

---

## Risks

1. **WebView2 dependency**: Requires Edge runtime (pre-installed on Win 11, automatic on Win 10 with Edge updates). Edge is ubiquitous on Windows, so low risk — but worth noting.
2. **Voice pipeline complexity**: Real-time streaming audio → STT → LLM → TTS is a genuinely hard problem. Latency, buffer management, and threading are non-trivial. The pipeline needs careful async design in Rust with tokio.
3. **Whisper.cpp CPU performance**: On older CPUs, even quantized models may be too slow for real-time. Must support cloud STT fallback.
4. **Piper TTS quality**: Piper is good but not ElevenLabs-good. Users may want cloud TTS as an option.
5. **Command execution safety**: The user explicitly wants dangerous operations to require confirmation. Getting this right — not too annoying, not too permissive — requires careful UX design.
6. **Ollama dependency for local LLM**: Users must install Ollama separately unless we bundle it (which would bloat the app). Alternative: use `llama.cpp` directly via Rust bindings, but that's more complex.
7. **Developer Rust experience**: If the team is not familiar with Rust, there's a learning curve. The async/await model, borrow checker, and Tauri's IPC patterns all take time to master.

---

## Ready for Next Phase

**Ready for Proposal**: Yes

The exploration is comprehensive enough to define scope and approach. The orchestrator should proceed with `sdd-propose` to formalize scope, IN/OUT, and rollback plan before moving to spec and design.

Key insight for proposal: **Mambru is fundamentally a "Rust app with a web UI shell"** — not a web app, not a traditional native app. All critical work (voice, LLM, security, system access) lives in Rust. The UI is a thin Svelte layer communicating via Tauri IPC. This architecture gives the best of both worlds: Rust performance/safety for the hard stuff, web flexibility for the interface.
