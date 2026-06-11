# Spec: patches/README.md

## Requirement

MUST document the purpose of both local patch crates (`patches/whisper-rs/`, `patches/whisper-rs-sys/`), what they change versus upstream, and any caveats for contributors.

## Acceptance

- File exists at `src-tauri/patches/README.md`
- Explains WHY the patches exist (e.g., MSYS2 MinGW codecvt linking fix, or other)
- Explains WHAT was changed
- Explains how to verify the patch is still needed on crate upgrades
