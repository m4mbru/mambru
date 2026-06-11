# Design: project-cleanup

## Overview

All work items are additive or annotative — no behavioral changes, no refactoring.

## Design Decisions

### 1. patches/README.md
- Simple Markdown file at `src-tauri/patches/README.md`
- Three sections: Why, What Changed, Upgrading

### 2. Dead-code warnings
| Location | Function | Decision |
|----------|----------|----------|
| `audit.rs:85` | `AuditLog::list` | `#[allow(dead_code)]` — public API for external consumers |
| `audit.rs:111` | `AuditLog::count` | `#[allow(dead_code)]` — same |
| `classifier.rs:45` | `RiskClassifier::classify` | `#[allow(dead_code)]` — public API surface |
| `classifier.rs:58` | `RiskClassifier::classify_shell` | `#[allow(dead_code)]` — public API surface |
| `builder.rs:245` | `CommandBuilder::suggest_params` | `#[allow(dead_code)]` — utility for future UI |
| `registry.rs:136` | `CommandRegistry::add` | `#[allow(dead_code)]` — public API for programmatic use |
| `stt.rs:242` | `MockSttBackend::with_response` | `#[allow(dead_code)]` — test helper |

All get `#[allow(dead_code)]` rather than removal because they represent legitimate API surface that will be used once integrated.

### 3. cargo-mambru.sh
- Bash script with same logic as `.bat`
- On Windows (Git Bash / MSYS2): prepend MSYS2 path
- On Linux/macOS: print a message directing to native toolchain setup
- `exec cargo "$@"` for proper signal handling

## File Plan

| File | Action |
|------|--------|
| `src-tauri/patches/README.md` | Create |
| `src-tauri/src/security/audit.rs` | Edit: add `#[allow(dead_code)]` |
| `src-tauri/src/security/classifier.rs` | Edit: add `#[allow(dead_code)]` |
| `src-tauri/src/tools/commands/builder.rs` | Edit: add `#[allow(dead_code)]` |
| `src-tauri/src/tools/commands/registry.rs` | Edit: add `#[allow(dead_code)]` |
| `src-tauri/src/voice/stt.rs` | Edit: add `#[allow(dead_code)]` |
| `scripts/cargo-mambru.sh` | Create |

## Risks

None — all changes are additive or annotation-only.
