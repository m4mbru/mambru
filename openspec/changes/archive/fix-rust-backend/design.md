# Design: Fix Rust Backend Build and Voice Pipeline

Unblocks `cargo build` on `x86_64-pc-windows-gnu` by fixing the toolchain PATH, updating deps with API migrations, fixing code-level bugs, and adding model download UX.

## Technical Approach

### Step 1: Toolchain PATH
Prepend `C:\msys64\ucrt64\bin` to `$env:PATH` before `cargo build`. Three options:

| Option | Detail | Choice |
|--------|--------|--------|
| VS Code task | `"command": "cargo build"` with `options.env.PATH` prepend | Use for dev workflow |
| `build.rs` | Prepend PATH at compile time via `std::env::set_var` | Too late — `dlltool` resolved before build.rs runs |
| Batch wrapper | `scripts/cargo-mambru.bat` that sets PATH then calls `cargo` | **Yes** — portable, CI-friendly |

The batch file becomes the canonical build entry point for Windows GNU targets. The existing `build.rs` is unchanged.

### Step 2: Deps Update

#### whisper-rs 0.16
- `whisper_rs::WhisperContext::new(&model_path)` unchanged in signature but internal model loading changed
- `create_state()` → the `WhisperContext::create_state()` API is deprecated in 0.16; use `Context::new()` directly (which returns a state handle)
- Streaming transcription: 0.16 exposes `params.set_no_context(true)` and `state.full(params, audio)` — same call pattern, but the `Context` now owns model data differently (no `std::mem::forget` needed)

#### whisper-rs-sys MinGW Patch
- Problem: `whisper-rs-sys/build.rs` adds `/utf-8` MSVC flag on all Windows targets unconditionally
- MinGW `gcc` rejects `/utf-8` with `unrecognized command-line option`
- Fix: patch `build.rs` to check `CARGO_CFG_TARGET_VENDOR` — only add `/utf-8` when vendor is `"pc"` (MSVC), not when it is `"unknown"` (MinGW)
- Implementation: Cargo `[patch.crates-io]` section pointing to a local patched copy at `src-tauri/patches/whisper-rs-sys/`
- Conditional flag guard in patched build.rs:
  ```rust
  // Only add MSVC-specific /utf-8 on MSVC targets
  #[cfg(not(target_env = "gnu"))]
  println!("cargo:rustc-cfg=msvc_compat");
  ```

#### webrtc-vad 0.4.10
- Exact pin in Cargo.toml: `webrtc-vad = "=0.4.10"`
- API changes from 0.4.x:
  - `Vad::new(sample_rate: u32)` — takes `u32` directly, no `VadSampleRate` enum
  - `set_mode(mode: u8)` — takes `u8` directly, no `VadAggressiveness` enum
  - `is_voice_segment(&self, frame: &[i16]) -> bool` — unchanged

### Step 3: Code Fixes

#### vad.rs — webrtc-vad 0.4.10 API migration
- `VadEngine::new()`: replace `VadSampleRate::from(config.sample_rate)?` → use `config.sample_rate` directly (u32)
- Replace `VadAggressiveness::from(config.mode)?` → `config.mode` as u8 directly
- `reset()`: same replacements — remove enum wrappers
- `VadConfig.mode` already `u8`, `sample_rate` already `u32` — types match the new API

#### stt.rs — whisper-rs 0.16 migration
- Remove dead `run_transcription(&self, audio)` method — references `self.ctx` which does not exist on `WhisperBackend` struct (compile error)
- The actual `transcribe()` async method already uses `spawn_blocking` with fresh context — no `self.ctx` needed
- In the `spawn_blocking` closure, update to 0.16 patterns:
  - `WhisperContext::new(&model_path)` → still valid, returns context
  - `ctx.create_state()` → review if still supported in 0.16; if removed, use `Context::new()` directly
- `find_model_file()`: update to check for `.gguf` extension as well (whisper.cpp newer format)

#### tools/mod.rs — Add SearchResult
```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub title: String,
    pub url: String,
    pub snippet: String,
}
```

#### registry.rs — Fix borrow-after-move
- Root cause: `parsed.command` is consumed by `.into_iter()` on line 75, then accessed via `.len()` on line 100
- Fix: capture original length before consuming:
  ```rust
  let original_len = parsed.command.len();
  let valid: Vec<Command> = parsed.command.into_iter().filter(...).collect();
  if valid.len() < original_len { ... }
  ```

### Step 4: Model Download Module

New file: `src-tauri/src/voice/download.rs`

#### Architecture
```
Frontend                          Backend
   │                                │
   ├─ invoke("check_models") ──────→│ scan {app_data_dir}/models/*
   │←────── HashMap<ModelKind,      │
   │         ModelState>             │
   │                                │
   │  [if any ModelState::Missing]   │
   │                                │
   ├─ invoke("start_download",       │
   │   kind) ──────────────────────→│ reqwest GET stream
   │                                │ app_handle.emit("model:progress")
   │←── listen("model:progress") ───│ {name, bytes, total}
   │                                │
   │  [on complete]                 │ extract .tar.gz (Piper)
   │←── listen("model:done") ───────│ verify size, update state
   │                                │
   │  [ui updates store → close     │
   │   dialog when all done]        │
```

#### Download flow (sequence)
```
check_models()
  → scan {app_data_dir}/models/whisper/ggml-base.bin
  → scan {app_data_dir}/models/piper/*.tflite
  → return ModelState per kind

start_download(kind)
  → validate not already downloading
  → spawn tokio task:
    1. reqwest::get(url) with configurable URL
    2. response.bytes_stream() — chunk counting for progress
    3. app_handle.emit("model:progress", { name, bytes, total })
    4. On complete:
       a. If Piper: extract .tar.gz → find .tflite + .json
       b. Verify file size matches expected
       c. app_handle.emit("model:done", { name, success: true })
    5. On error:
       a. Clean up partial file
       b. app_handle.emit("model:done", { name, success: false })
```

#### Models directory
- Whisper: `{app_data_dir}/models/whisper/ggml-base.bin`
- Piper: `{app_data_dir}/models/piper/voice.onnx` + `voice.onnx.json`
- Resolution via `tauri::Manager::path().app_data_dir()`

### Step 5: design.md Sync
See the second artifact below — full sync of `openspec/changes/mambru-app/design.md`.

## Architecture Decisions

### ADR 1: Tauri IPC events for model download progress
| Option | Tradeoff | Choice |
|--------|----------|--------|
| Dialog-based blocking download | Simple but blocks UI, no progress | |
| Tauri IPC events | Same pattern as `llm:token`, async non-blocking, frontend listens/reacts | **Yes** |
| reqwest with callback channel | More complex serialization, no Tauri binding | |
**Rationale**: Tauri `app_handle.emit()` is already the established streaming pattern in the codebase (`llm:token`, `voice:transcribed`). Consistency > introducing new IPC patterns.

### ADR 2: whisper-rs local patch (not wait for upstream)
| Option | Tradeoff | Choice |
|--------|----------|--------|
| Wait for whisper-rs fix | Zero maintenance, but no timeline | |
| Local Cargo patch | Immediate fix, must maintain fork | **Yes** |
| Switch to whisper.cpp bindings directly | More work, same problem | |
**Rationale**: Blocking the build on an upstream fix is unacceptable. The patch is a single conditional in `build.rs` — minimal maintenance surface. If upstream fixes it, revert the patch section.

### ADR 3: webrtc-vad exact pin `=0.4.10`
| Option | Tradeoff | Choice |
|--------|----------|--------|
| `webrtc-vad = "0.4"` | Semver-compatible updates may break API | |
| `=0.4.10` | No surprise API drift on minor bumps | **Yes** |
**Rationale**: The 0.4.x line has seen API-breaking changes in patch versions before (the whole reason for this migration). Exact pin prevents CI breakage from upstream churn.

### ADR 4: `app_data_dir` for models (not bundled or user-configurable)
| Option | Tradeoff | Choice |
|--------|----------|--------|
| Bundled in installer | Larger installer, platform-specific packaging | |
| User-configurable path | UX complexity, support burden | |
| `app_data_dir` | Standard Tauri convention, no config needed | **Yes** |
**Rationale**: Bundling 50-150MB model files with every install is wasteful. `app_data_dir` is the Tauri-canonical location for runtime data, works cross-platform, and doesn't require user configuration.

## Data Flow

```
            ┌──────────────┐
            │  App startup  │
            └──────┬───────┘
                   │
                   ▼
        invoke("check_models")
                   │
                   ▼
        scan {app_data_dir}/models/
        ┌─────┬──────┬──────┐
        │  W  │  P   │  ... │
        └──┬──┴──┬───┴──┬───┘
           │     │      │
           ▼     ▼      ▼
    ModelState::Ready | Missing | Failed
                   │
        ┌──────────┴──────────┐
        │                     │
   all Ready            any Missing
        │                     │
        ▼                     ▼
  normal startup     Frontend: DownloadDialog
        │                │
        │         User clicks Download
        │                │
        │                ▼
        │     invoke("start_download", kind)
        │                │
        │       reqwest GET stream
        │                │
        │     ┌──────────┴──────────┐
        │     │                     │
        │  app_handle.emit(    on complete:
        │   "model:progress")  extract, verify,
        │     │                emit model:done
        │     │                     │
        │     └─────────────────────┘
        │                │
        │       Frontend updates store
        │                │
        │       ┌────────┴────────┐
        │       │                 │
        │  more pending      all done
        │       │                 │
        │       ▼                 ▼
        │  continue d/l    close dialog
        │                 voice features ON
        └────────────────────────────
```

## Interfaces / Contracts

```rust
// ── src-tauri/src/voice/download.rs ──

/// Which model kind to download.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum ModelKind {
    Whisper,
    Piper,
}

/// Current state of a model on disk or in-progress.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ModelState {
    /// Model file not found.
    Missing,
    /// Download in progress with byte progress.
    Downloading {
        bytes: u64,
        total: u64,
    },
    /// Model is present and ready.
    Ready,
    /// Download or verification failed.
    Failed(String),
}

/// Scan models directory and return state per kind.
#[tauri::command]
async fn check_models(app: tauri::AppHandle) -> Result<HashMap<ModelKind, ModelState>, String>;

/// Start downloading the given model kind.
/// Emits "model:progress" and "model:done" events.
#[tauri::command]
async fn start_download(app: tauri::AppHandle, kind: ModelKind) -> Result<(), String>;

// ── IPC event payloads ──

/// "model:progress" event payload
#[derive(Debug, Clone, Serialize)]
pub struct ModelProgressPayload {
    pub name: String,    // "whisper" | "piper"
    pub bytes: u64,
    pub total: u64,
}

/// "model:done" event payload
#[derive(Debug, Clone, Serialize)]
pub struct ModelDonePayload {
    pub name: String,
    pub success: bool,
}

// ── Tools ──

/// Struct for web search results (tools/mod.rs)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub title: String,
    pub url: String,
    pub snippet: String,
}
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `scripts/cargo-mambru.bat` | New | Prepend MSYS2 to PATH, call `cargo build` — canonical build entrypoint |
| `src-tauri/Cargo.toml` | Modify | `whisper-rs = "0.16"`, `webrtc-vad = "=0.4.10"`, add `[patch.crates-io]` for whisper-rs-sys |
| `src-tauri/patches/whisper-rs-sys/Cargo.toml` | New | Local crate mirroring whisper-rs-sys with patched build.rs |
| `src-tauri/patches/whisper-rs-sys/build.rs` | New | Patched build.rs: guard `/utf-8` with `#[cfg(not(target_env = "gnu"))]` and check `CARGO_CFG_TARGET_VENDOR` |
| `src-tauri/patches/whisper-rs-sys/src/lib.rs` | New | Re-export of original whisper-rs-sys src (thin re-export wrapper) |
| `src-tauri/src/voice/vad.rs` | Modify | Migrate to webrtc-vad 0.4.10 API: remove `VadSampleRate`/`VadAggressiveness` enum wrappers in `new()` and `reset()` |
| `src-tauri/src/voice/stt.rs` | Modify | Remove dead `run_transcription()`, update `spawn_blocking` to whisper-rs 0.16 API, add `.gguf` detection |
| `src-tauri/src/tools/mod.rs` | Modify | Add `SearchResult` struct with `title`, `url`, `snippet`, `Serialize`/`Deserialize` |
| `src-tauri/src/tools/commands/registry.rs` | Modify | Fix borrow-after-move: capture `original_len` before `into_iter()` |
| `src-tauri/src/voice/download.rs` | New | Model download module: `check_models`, `start_download`, progress events, tar.gz extraction |
| `src-tauri/src/main.rs` | Modify | Register `check_models` and `start_download` in invoke_handler; add model scan to `setup()` |
| `src/lib/components/DownloadDialog.svelte` | New | Svelte component: lists missing models, download button, progress bars, skip option |
| `src/lib/stores/models.ts` | New | Svelte store: `Writable<Map<ModelKind, ModelState>>`, listen for `model:progress`/`model:done` |
| `src/lib/api/models.ts` | New | `invoke("check_models")` and `invoke("start_download")` wrappers |
| `src/App.svelte` | Modify | Show DownloadDialog on startup if models are missing |
| `openspec/changes/mambru-app/design.md` | Modify | Sync crate references, add model-download section |

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit (Rust) | `VadEngine::new()` with new API | Init with valid/invalid sample rates, verify is_speech works (existing tests maintain coverage) |
| Unit (Rust) | `SearchResult` serialization | Round-trip serde test |
| Unit (Rust) | `registry.rs` borrow-after-move fix | Verify load with valid/invalid commands, confirm no panic |
| Unit (Rust) | `ModelKind`/`ModelState` round-trip | Serde serialize/deserialize |
| Integration | Model download flow | Mock reqwest response, verify `model:progress` and `model:done` events emitted via `app.emit` mock |
| Frontend | DownloadDialog component | Vitest: renders missing models, download click invokes command, progress updates store |
| Frontend | models store | Vitest: `model:progress` event updates bytes/total correctly |
| Build | `cargo build --target x86_64-pc-windows-gnu` | Must succeed (primary success criterion) |
| Build | `cargo test` | All existing Rust tests pass |

## Open Questions

- [ ] Whisper model URL: confirm canonical download URL for `ggml-base.bin` (or `.gguf`) from HuggingFace
- [ ] Piper model URL: confirm canonical download URL for `voice.onnx` + `voice.onnx.json`
- [ ] File size verification: do we hardcode expected sizes or download a checksum file?
