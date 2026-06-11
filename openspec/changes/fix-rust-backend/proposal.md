# Proposal: Fix Rust Backend Build and Voice Pipeline

## Intent

Rust backend does not compile on `x86_64-pc-windows-gnu` — missing toolchain PATH, outdated deps with API drift, and code-level bugs. Blocks `cargo build`, `cargo test`, and the verify/archive SDD phases. Fix and unblock.

## Scope

### In Scope
- Add `C:\msys64\ucrt64\bin` to PATH (fix `dlltool.exe`)
- Update `whisper-rs` and `webrtc-vad` to compatible versions
- Patch `whisper-rs-sys` build.rs for MinGW compatibility
- Fix code errors: `vad.rs` (webrtc-vad API), `stt.rs` (whisper-rs 0.16 API), `tools/mod.rs` (missing `SearchResult`), `registry.rs` (borrow-after-move)
- `cargo build` succeeds on `x86_64-pc-windows-gnu`
- `cargo test` passes for Rust backend
- Add model download UX for Whisper + Piper at first launch
- Update `design.md` to match actual implementation
- Preserve 37 passing frontend Vitest tests

### Out of Scope
- ESLint/Prettier configuration (separate change)
- New features beyond fixing the build
- E2E testing
- MSVC toolchain migration

## Capabilities

### New Capabilities
- `model-download`: First-launch dialog downloads Whisper + Piper models with progress events and graceful fallback to text-only mode

### Modified Capabilities
- `voice-pipeline`: VAD requirement changes from "Silero VAD" to "webrtc-vad". TTS requirement changes from "piper-rs crate" to "subprocess-based PiperBackend"

## Approach

| Step | What | Detail |
|------|------|--------|
| 1 | Toolchain PATH | Prepend `C:\msys64\ucrt64\bin` to `$env:PATH` before `cargo build` |
| 2 | Deps update | `whisper-rs = "0.16"`, patch `whisper-rs-sys` to skip MSVC `/utf-8` flag on GNU targets; pin `webrtc-vad` to `0.4.10` |
| 3 | `vad.rs` | Replace `VadSampleRate` / `VadAggressiveness` with new webrtc-vad 0.4 API |
| 4 | `stt.rs` | Adapt to whisper-rs 0.16 `Context::new()` + streaming transcription API |
| 5 | `tools/mod.rs` | Add `SearchResult` struct with `title`, `url`, `snippet` fields |
| 6 | `registry.rs` | Fix borrow-after-move via clone or restructure match arm |
| 7 | Model download | New module: `tauri-plugin-dialog` for directory picker, `reqwest` streaming download, progress events via Tauri `emit` |
| 8 | `design.md` sync | Remove refs to `ollama-rs`, `llm`, `silero-vad-rs`, `piper-rs`. Add `model-download` |

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src-tauri/Cargo.toml` | Modified | Dep versions + sys patch dep |
| `src-tauri/src/voice/vad.rs` | Modified | webrtc-vad API migration |
| `src-tauri/src/voice/stt.rs` | Modified | whisper-rs 0.16 API migration |
| `src-tauri/src/tools/mod.rs` | Modified | Add `SearchResult` type |
| `src-tauri/src/tools/commands/registry.rs` | Modified | Fix borrow-after-move |
| `src-tauri/src/voice/download.rs` | New | Model download module |
| `openspec/changes/mambru-app/design.md` | Modified | Sync crate references |
| `openspec/specs/voice-pipeline/spec.md` | Modified | VAD/TTS requirement updates |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| whisper-rs 0.16 enum repr uses `i32` but crate assumes `u32` on GNU | High | Patch whisper-rs-sys enum definitions to use correct C ABI; pin known-working commit |
| whisper-rs-sys build.rs injects `/utf-8` MSVC flag on all Windows targets | High | Patch build.rs to check `CARGO_CFG_TARGET_VENDOR` before adding MSVC-specific flags |
| webrtc-vad patch version API drift | Low | Pin to exact `0.4.10` |
| Model download UX scope creep | Med | MVP: folder picker + progress bar + silent TTS fallback if cancelled |

## Rollback Plan

1. Revert `Cargo.toml` to `whisper-rs = "0.13"` and remove sys patch
2. Revert all `.rs` file changes (vad.rs, stt.rs, tools/mod.rs, registry.rs)
3. Remove `src/voice/download.rs` if added
4. `git checkout` to restore design.md and voice-pipeline spec
5. `cargo build` with 0.13 may still fail on dlltool — toolchain PATH change is additive and safe to keep

## Dependencies

- MSYS2 MinGW-w64 at `C:\msys64\ucrt64\bin` (already installed)
- `whisper-rs` 0.16 + patched `whisper-rs-sys` (git source or patch)
- `webrtc-vad` 0.4.10
- Whisper base model (downloaded at launch via model-download)
- Piper voice model (downloaded at launch via model-download)

## Success Criteria

- [ ] `cargo build --target x86_64-pc-windows-gnu` succeeds
- [ ] `cargo test` passes all Rust unit + integration tests
- [ ] `npm test` still passes all 37 frontend Vitest tests
- [ ] First launch with no model files shows download dialog
- [ ] PTT → capture → STT → LLM → TTS works end-to-end
- [ ] `design.md` no longer references `ollama-rs`, `llm`, `silero-vad-rs`, or `piper-rs`
