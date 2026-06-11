# Spec: scripts/cargo-mambru.sh

## Requirement

SHALL provide a POSIX shell equivalent of `scripts/cargo-mambru.bat` for Linux/macOS contributors.

## Acceptance

- File exists at `scripts/cargo-mambru.sh`
- Executable permissions set
- Prepends `C:/msys64/ucrt64/bin` (or equivalent MSYS2 path) to PATH on Windows Git Bash
- On Linux/macOS: either adapts or documents the equivalent toolchain setup
- Passes all arguments through to `cargo`
