# Tasks: Fix Rust Backend Build and Voice Pipeline

## Review Workload Forecast

Decision needed before apply: **Yes — 400-line budget risk is High**
Chained PRs recommended: **Yes** (ask-on-risk: ask before splitting)
Chain strategy: stacked-to-main
400-line budget risk: **High**

~1,000+ lines across 15+ modified/new files. Phase 4 (model download) alone is ~590 lines (Rust module + Svelte component + TS API/store). Surgical fixes in Phases 1-3 are small (~15, ~60, ~37 lines). Phase 6 adds ~200 lines for 86 pre-existing Tauri v2 + rodio thread-safety errors.

Apply should ask before splitting into chained PRs:
- **PR 1 (minimal, ~112 lines)**: Phases 1-3 — toolchain, deps, code fixes.
- **PR 2 (model download, ~590 lines)**: Phase 4 — new Rust download module + Svelte dialog + TS wrappers.
- **PR 3 (pre-existing fixes, ~200 lines)**: Phase 6 — Tauri v2 State API + AudioOutput Send fix + type mismatches.
- **PR 4 (sync, ~30 lines)**: Phase 5 — design.md sync + verify all tests pass.

If single-PR is preferred, the 400-line budget requires a `size:exception`.

---

## Phase 1: Toolchain & Setup

Get the MSYS2 MinGW toolchain reachable so `cargo build` stops failing immediately.

- [x] **1.1 Create `scripts/cargo-mambru.bat`** [`scripts/cargo-mambru.bat` — new]
  Prepend `C:\msys64\ucrt64\bin` to `%PATH%`, then call `cargo %*`. This is the canonical build entrypoint for Windows GNU targets.
  - Must pass all args through to `cargo` (use `%*`)
  - VS Code task and CI both invoke this instead of raw `cargo build`
  - Keeps existing `build.rs` unchanged (it cannot fix PATH early enough for `dlltool.exe`)
  - **Technical note**: `.bat` not `.ps1` — must work in both Git Bash and cmd.exe contexts that Cargo uses

- [x] **1.2 Verify MSYS2 dlltool.exe is reachable** [no permanent files]
  Run `scripts/cargo-mambru.bat build --target x86_64-pc-windows-gnu` as smoke test. Expect `dlltool.exe` to resolve. Will still fail on code errors — that is expected. If `dlltool` is not found, verify MSYS2 path is correct and the package `mingw-w64-ucrt-x86_64-binutils` is installed.

---

## Phase 2: Dependency Updates

Update crate versions and patch `whisper-rs-sys` for MinGW compatibility.

- [x] **2.1 Update `Cargo.toml` dep versions** [`src-tauri/Cargo.toml` — modify]
  - `whisper-rs = "0.13"` → `whisper-rs = "0.16"`
  - `webrtc-vad = "0.4"` → `webrtc-vad = "=0.4.10"` (exact pin to avoid API drift)
  - Leave all other deps unchanged
  - **Technical note**: `=0.4.10` is intentional per ADR 3 — semver-compatible patches have broken API before

- [x] **2.2 Create whisper-rs-sys MinGW patch** [`src-tauri/patches/whisper-rs-sys/Cargo.toml` + `build.rs` + `src/lib.rs` — new]
  Local crate directory that mirrors `whisper-rs-sys` with a patched `build.rs`:
  - `Cargo.toml`: same package name `whisper-rs-sys`, same version, same deps as the upstream crate
  - `build.rs`: guard the MSVC `/utf-8` flag — only emit `cargo:rustc-cfg=msvc_compat` when `target_env` is NOT `"gnu"`:
    ```rust
    // Only add MSVC-specific /utf-8 on MSVC targets
    #[cfg(not(target_env = "gnu"))]
    println!("cargo:rustc-cfg=msvc_compat");
    ```
  - `src/lib.rs`: re-export the entire upstream `whisper-rs-sys` public API so whisper-rs can link against it
  - **Technical note**: The patched `build.rs` must also check `CARGO_CFG_TARGET_VENDOR` — only add `/utf-8` when vendor is `"pc"` (MSVC), skip when `"unknown"` (MinGW). You can use `cfg!(target_vendor = "pc")` for this

- [x] **2.3 Add `[patch.crates-io]` to `Cargo.toml`** [`src-tauri/Cargo.toml` — modify]
  ```toml
  [patch.crates-io]
  whisper-rs-sys = { path = "patches/whisper-rs-sys" }
  ```
  This redirects any dependency on `whisper-rs-sys` (including the transitive one from `whisper-rs`) to the local patched copy.

- [x] **2.4 Run `scripts/cargo-mambru.bat build` to verify deps resolve** [no permanent files]
  Expect resolution to succeed. Will still error on code (vad.rs, stt.rs, etc.) — that is expected. Verify the dep graph picks up the patched version by checking for the `no /utf-8` guard in build output.

---

## Phase 3: Code Fixes

Fix all Rust compilation errors now that deps are resolved.

- [x] **3.1 Fix `vad.rs` — webrtc-vad 0.4 API migration** [`src-tauri/src/voice/vad.rs` — modify]
  - `VadEngine::new()`: replace `webrtc_vad::VadSampleRate::from(config.sample_rate)?` → use `config.sample_rate` (already `u32`) directly
  - Replace `webrtc_vad::Vad::new(sample_rate)` — now takes `u32` directly, no `VadSampleRate` enum wrapper
  - Replace `webrtc_vad::VadAggressiveness::from(config.mode)?` → `config.mode` as `u8` directly
  - `inner.set_mode(mode)` — now takes `u8` directly, no `VadAggressiveness` enum
  - Same pattern in `reset()` method: remove `VadSampleRate` and `VadAggressiveness` wrappers
  - Remove `use anyhow::Context;` imports that are no longer needed for these conversions (but keep `anyhow::Result`)
  - **Technical note**: `Vad::new(sample_rate)` signature changed from `Vad::new(VadSampleRate)` to `Vad::new(u32)`. `set_mode(mode)` changed from `set_mode(VadAggressiveness)` to `set_mode(u8)`. The `from()` conversions are gone entirely

- [x] **3.2 Fix `stt.rs` — whisper-rs 0.16 API migration** [`src-tauri/src/voice/stt.rs` — modify]
  - **Remove dead method**: Delete `run_transcription(&self, audio)` entirely. It references `self.ctx` which does not exist on `WhisperBackend` (compile error). The real transcription happens in the `transcribe()` async method already
  - **Update `transcribe()`**: In the `spawn_blocking` closure, replace `ctx.create_state()` with direct `Context::new()` usage if `create_state()` was removed in 0.16. Check whisper-rs 0.16 changelog:
    - If `create_state()` still exists: keep it but verify return type
    - If removed: the `spawn_blocking` closure already creates a fresh `WhisperContext::new(&model_path)` — the pattern is fine, just remove the `create_state()` call and work with `ctx` directly
  - **Add `.gguf` detection**: In `find_model_file()`, add `ext == "gguf"` alongside `ext == "bin"` and `ext == "ggml"` — whisper.cpp newer format
  - Remove unused imports (e.g., `use std::path::Path;` if no longer needed after `run_transcription` removal)
  - **Technical note**: In whisper-rs 0.16, `WhisperContext::new()` still takes `&str`, returns `Result<WhisperContext>`. The `full()` call pattern (`state.full(params, audio)`) is unchanged. `full_n_segments()` and `full_get_segment_text(i)` are also unchanged

- [x] **3.3 Fix `tools/mod.rs` — re-export `SearchResult`** [`src-tauri/src/tools/mod.rs` — modify]
  - `SearchResult` is already defined in `src/tools/search.rs` with `Serialize`/`Deserialize`
  - `commands/tools.rs` references `crate::tools::SearchResult` (line 209) but `tools/mod.rs` only re-exports `SearchClient`, not `SearchResult`
  - Fix: add `pub use search::SearchResult;` alongside the existing `pub use search::SearchClient;`
  - **Technical note**: This is a structural fix. The `SearchResult` struct itself already has all required derives. Just need the re-export so the `search_web` command resolves its return type

- [x] **3.4 Fix `registry.rs` — borrow-after-move** [`src-tauri/src/tools/commands/registry.rs` — modify]
  - Root cause: `parsed.command` is consumed by `.into_iter()` on line 75, then `.len()` is called on it at line 100
  - Fix: capture length before consuming:
    ```rust
    let original_len = parsed.command.len();
    let valid: Vec<Command> = parsed.command.into_iter().filter(...).collect();
    if valid.len() < original_len { ... }
    ```
  - Replace `parsed.command.len()` on line 100 with `original_len`
  - Replace `parsed.command.len() - valid.len()` with `original_len - valid.len()`
  - **Technical note**: No functional change — same logic, just avoids the borrow-after-move. No need to clone the Vec, just capture the usize before `into_iter()` consumes it

---

## Phase 4: Model Download

Add first-launch model download UX for Whisper + Piper.

- [ ] **4.1 Create `src-tauri/src/voice/download.rs`** [`src-tauri/src/voice/download.rs` — new]
  Full module with these types and IPC commands from the design:
  ```rust
  // Types
  enum ModelKind { Whisper, Piper }
  enum ModelState { Missing, Downloading { bytes, total }, Ready, Failed(String) }
  struct ModelProgressPayload { name: String, bytes: u64, total: u64 }
  struct ModelDonePayload { name: String, success: bool }

  // IPC commands
  async fn check_models(app: AppHandle) -> Result<HashMap<ModelKind, ModelState>, String>
  async fn start_download(app: AppHandle, kind: ModelKind) -> Result<(), String>
  ```
  - `check_models`: scan `{app_data_dir}/models/whisper/ggml-base.bin` and `{app_data_dir}/models/piper/*.tflite` + `*.json`. Return `ModelState::Ready` per kind if files exist, `ModelState::Missing` if not
  - `start_download`: spawn tokio task per download:
    1. `reqwest::get(url)` streaming download — use `response.bytes_stream()`
    2. Chunk counting for progress, call `app_handle.emit("model:progress", payload)`
    3. On complete: if Piper, extract `.tar.gz` to find `.tflite` + `.json`
    4. Verify file existence (size check optional)
    5. Emit `model:done` with success
    6. On error: clean partial file, emit `model:done` with failure
  - Resolve paths via `tauri::Manager::path().app_data_dir()`
  - Use `tauri::Emitter` trait for `app_handle.emit()`
  - Model download URLs should be configurable constants at top of file (TODO/placeholder for now — design has open questions about exact URLs)
  - Wire `download` module into `voice/mod.rs` — add `pub mod download;` and `pub use download::*;`
  - **Technical note**: `app_handle.emit()` requires the `Emitter` trait (`use tauri::Emitter;`). Progress events must be `#[derive(Debug, Clone, Serialize)]`. The `reqwest` dependency already includes `stream` feature

- [ ] **4.2 Wire download commands into `main.rs`** [`src-tauri/src/main.rs` — modify]
  Add to `invoke_handler`:
  ```rust
  commands::voice::check_models,
  commands::voice::start_download,
  ```
  Wait — the commands live in `voice/download.rs` as `#[tauri::command]`, not routed through `commands/voice.rs`. So add them directly:
  ```rust
  voice::download::check_models,
  voice::download::start_download,
  ```
  Or create thin wrappers in `commands/voice.rs` for consistency. Either approach works — prefer routing through `commands/voice.rs` to keep the command layer pattern consistent with other modules.
  - **Technical note**: Add after `commands::voice::get_voice_status` in the `generate_handler![]` macro

- [ ] **4.3 Create `src/lib/api/models.ts`** [`src/lib/api/models.ts` — new]
  TypeScript wrappers for the model download IPC commands:
  ```typescript
  export interface ModelProgressPayload { name: string; bytes: number; total: number; }
  export interface ModelDonePayload { name: string; success: boolean; }

  export async function checkModels(): Promise<Record<string, ModelState>>
  export async function startDownload(kind: ModelKind): Promise<void>

  // Event listeners
  export function listenForModelProgress(cb: (p: ModelProgressPayload) => void): Promise<UnlistenFn>
  export function listenForModelDone(cb: (p: ModelDonePayload) => void): Promise<UnlistenFn>
  ```
  - Follow the same pattern as `src/lib/api/voice.ts` — `invoke` from `@tauri-apps/api/core`, `listen` from `@tauri-apps/api/event`
  - **Technical note**: `ModelKind` maps to strings on the Rust side — `"Whisper"` and `"Piper"` (serde serialization of PascalCase enum variants). Use those exact strings in TS

- [ ] **4.4 Create `src/lib/stores/models.ts`** [`src/lib/stores/models.ts` — new]
  Svelte reactive store for model download state:
  ```typescript
  export interface ModelState {
    kind: ModelKind;
    status: 'missing' | 'downloading' | 'ready' | 'failed';
    bytes?: number;
    total?: number;
    error?: string;
  }

  export interface ModelStore {
    models: Map<ModelKind, ModelState>;
    allReady: boolean;
    hasMissing: boolean;
  }
  ```
  - Create a `writable<Record<string, ModelState>>` store keyed by model kind
  - On init, call `checkModels()` to populate initial state
  - Listen for `model:progress` events to update `bytes`/`total` for downloading models
  - Listen for `model:done` events to transition `downloading` → `ready` or `failed`
  - Export derived stores: `allReady`, `hasMissing`
  - Export action: `startDownload(kind)`, `retryDownload(kind)`, `skipDownloads()`
  - **Technical note**: Use `onMount` + `onDestroy` pattern for event listener lifecycle if this is used at the App level, or export `init()`/`destroy()` functions

- [ ] **4.5 Create `src/lib/components/DownloadDialog.svelte`** [`src/lib/components/DownloadDialog.svelte` — new]
  Modal dialog that shows on first launch when models are missing:
  - Lists each missing model with name, file size, and progress bar
  - "Download" button (primary) triggers sequential downloads
  - "Skip — text only" button (secondary) dismisses dialog, proceeds without voice
  - Progress bars update reactively via the models store
  - Retry button per model on failure
  - Close button in header treated as "Skip"
  - Dialog closes automatically when all models reach `ready` state
  - States: initial (list + download button), downloading (progress bars), error (retry button), done (auto-close)
  - Follow existing visual patterns: see `ConfirmationDialog.svelte` for modal overlay pattern
  - **Technical note**: Props: `show: boolean`, `onSkip: () => void`. Access the models store directly or accept models state as prop. Use Svelte `{#if}` for conditional rendering of each state

- [ ] **4.6 Wire DownloadDialog into `App.svelte`** [`src/App.svelte` — modify]
  - On mount, after `settings.load()` and `conversation.init()`, check model states:
    - Import models store and call its init function
    - Subscribe to `hasMissing` derived state
  - Show `DownloadDialog` conditionally: `{#if showDownloadDialog}`
  - On skip: dismiss dialog, voice features remain disabled
  - When all models ready: dismiss dialog, voice features enabled
  - Keep all existing functionality intact — this is additive
  - Add to `<script>`: import `onMount` logic for models, add `showDownloadDialog` state variable
  - **Technical note**: Use `onMount` to call `modelsStore.init()` and set up event listeners. Don't block the main chat from rendering — the dialog overlays on top

---

## Phase 5: Sync & Verify

Update the architecture docs and prove everything works.

- [ ] **5.1 Sync `openspec/changes/mambru-app/design.md`** [`openspec/changes/mambru-app/design.md` — modify]
  Changes needed:
  - **Key Crates table**: update `whisper-rs` from `0.13` to `0.16 (patched)`, set `webrtc-vad` to `=0.4.10`
  - **Remove stale refs**: search for and remove references to `ollama-rs`, `llm`, `silero-vad-rs`, `piper-rs` crate names (subprocess-based PiperBackend replaced the crate, direct reqwest replaced ollama-rs/llm crate)
  - **Add Model Download** design section: copy the content from `openspec/changes/fix-rust-backend/design.md#step-4-model-download-module` into a new subsection
  - **File Changes table**: Add the 5 new model download files and update dep version rows
  - **Update Decision rows**: The `ollama-rs`/`llm` ADR ("Direct reqwest for LLM providers") already exists — just ensure wording is accurate. The WebRTC VAD / Silero decision already exists. Add a note about the whisper-rs-sys MinGW patch decision
  - **Technical note**: The file list in the existing `mambru-app/design.md` still references the original v1 creation — keep those rows, just update the ones affected by this change (version numbers, add the new model download files)

- [ ] **5.2 Run full `cargo build`** [no permanent files]
  ```
  scripts/cargo-mambru.bat build --target x86_64-pc-windows-gnu
  ```
  Must succeed with zero errors. If it fails, diagnose and fix before proceeding.

- [ ] **5.3 Run `cargo test`** [no permanent files]
  ```
  scripts/cargo-mambru.bat test
  ```
  All Rust unit + integration tests pass. Pay attention to:
  - `vad.rs` tests (`test_vad_silence_on_zeros`, `test_vad_speech_on_loud_signal`)
  - `stt.rs` tests (mock backend tests)
  - `tools/mod.rs` tests (tool call execution)
  - `registry.rs` tests (command load/save/validate)
  - `voice/mod.rs` tests (pipeline integration)
  - `search.rs` tests (API client construction)

- [ ] **5.4 Run `npm test`** [no permanent files]
  ```
  npm test
  ```
  All 37 frontend Vitest tests still pass. Verify no regressions from the `DownloadDialog` or `models.ts` additions.

---

## Phase 6: Fix Pre-existing Compilation Errors (scope expansion)

86 pre-existing compilation errors found after completing PR1. Root causes:

| Error | Count | Root cause |
|-------|-------|------------|
| `*mut ()` not Send (E0277) | 35 | `AudioOutput` contains `rodio::OutputStream` (!Send/!Sync), propagates through VoicePipeline → AppState → State |
| `no method named 'lock'` (E0599) | 26 | Tauri v2 removed `State::lock()`, replaced with `state.inner().lock().unwrap()` |
| `State<Mutex<AppState>>` not CommandArg | 17 | Secondary to root cause 1 — AppState not Send |
| `str` size unknown (E0277) | 4 | Type inference — needs explicit `&str` or `.to_string()` |
| Type mismatches (E0308) | 3 | HashMap/stream type inference mismatches |

- [ ] **6.1 Fix Tauri v2 State API — replace `state.lock()` with `state.inner().lock().unwrap()`** [all commands/*.rs files]
  Files affected: `src-tauri/src/commands/chat.rs`, `voice.rs`, `settings.rs`, `tools.rs`
  - Search for all `state.lock()` calls (about 26 occurrences across 4 files)
  - Replace with `state.inner().lock().unwrap()`
  - Also add `use tauri::State;` import where missing
  - Pattern: `let state = app.state::<Mutex<AppState>>();` → `let state = state.inner().lock().unwrap();`
  - **Technical note**: Tauri v2 made State a transparent wrapper. `.lock()` is not a method on State — but `.inner()` returns `&T`, then you call `.lock()` on the Mutex. If the inner type is already a reference, you may need `.inner().lock().unwrap()`

- [ ] **6.2 Fix AudioOutput !Send issue — make AudioOutput thread-safe** [`src-tauri/src/voice/tts.rs` — modify]
  Problem: `rodio::OutputStream` and `rodio::OutputStreamHandle` are deliberately !Send/!Sync because they're tied to a platform-specific audio event loop.
  
  Solution: Wrap AudioOutput in a thread-safe wrapper that uses unsafe Send/Sync impl:
  ```rust
  /// Thread-safe wrapper around AudioOutput.
  /// rodio's OutputStream is !Send/!Sync by design, but in practice
  /// all access is serialized through the containing Mutex<AppState>.
  pub struct SafeAudioOutput(Mutex<Option<AudioOutput>>);
  
  // SAFETY: AudioOutput is only accessed through Mutex<AppState> which
  // serializes all access. The underlying rodio stream is per-thread
  // but Windows cpal implementation handles cross-thread usage safely.
  unsafe impl Send for SafeAudioOutput {}
  unsafe impl Sync for SafeAudioOutput {}
  ```
  
  Changes in tts.rs:
  - Rename `AudioOutput` internal struct or create `SafeAudioOutput` wrapper
  - Add `unsafe impl Send for AudioOutput {}` and `unsafe impl Sync for AudioOutput {}`
  - In `VoicePipeline`, change `audio: Option<AudioOutput>` to `audio: Option<SafeAudioOutput>` or just add the unsafe impls on the struct
  - **Technical note**: The simplest and safest fix is adding `unsafe impl Send` and `unsafe impl Sync` directly on the `AudioOutput` struct with a SAFETY comment. rodio's OutputStream is !Send mostly for macOS/AudioUnit reasons — on Windows WASAPI it's safe. Alternative: create AudioOutput lazily in `speak()` and don't store it in AppState at all.

- [ ] **6.3 Fix type inference errors — `str` size + E0308 mismatches** [`src-tauri/src/commands/chat.rs`, `src-tauri/src/tools/search.rs`, `src-tauri/src/tools/executor.rs` — modify]
  - `chat.rs` (4 × str): `stream.map(|s| s)` — add `as &str` or `to_string()` to resolve Sized
  - `search.rs` (2 × E0308): HashMap type params — add explicit type annotations
  - `executor.rs` (1 × E0308): Return type mismatch — match expected type or add conversion
  - Read each file to find exact error locations and fix surgically
