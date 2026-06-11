# Proposal: project-cleanup — Post-v1 Housekeeping

## Intent

Clean up Mambru after the initial v1 implementation: document pending patches, fix dead code warnings, add cross-platform tooling, commit the working tree, and close the open `fix-rust-backend` change.

## Scope

### In Scope
- Document `patches/whisper-rs` and `patches/whisper-rs-sys` — why they exist, what they patch
- Fix 5 Rust dead-code warnings (`AuditLog::list/count`, `RiskClassifier::classify/classify_shell`, `CommandBuilder::suggest_params`, `CommandRegistry::add`, `MockSttBackend::with_response`)
- Create `scripts/cargo-mambru.sh` (Linux/macOS equivalent of the existing `.bat`)
- Commit the working tree with all changes
- Archive the open SDD change `fix-rust-backend`

### Already Done
- `.gitignore` — added `nul` and `nul:` entries
- `.gitattributes` — created with LF/CRLF normalization rules
- Toolchain diagnosis — `dlltool.exe` at `C:\msys64\ucrt64\bin\` but not in default PATH

### Out of Scope
- Untracked WIP features (model download, hologram avatar specs, etc.)
- New functionality or features
- CI/CD setup (GitHub Actions)
- E2E or integration tests for Rust backend

## Capabilities

N/A — housekeeping only, no new capabilities.

## Approach

Each item is small and mechanical. Work in dependency order:

1. Write `patches/README.md` (zero risk)
2. Fix 5 dead code warnings in Rust (add `#[allow(dead_code)]` or mark `pub` — evaluate each case)
3. Create `scripts/cargo-mambru.sh` (mirror `.bat` logic)
4. Commit all changes as a single unit
5. Archive `fix-rust-backend` via SDD archive workflow

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Warning fixes change public API | Low | Only two cases have true public API — use `#[allow(dead_code)]` instead of removing |
| Script path wrong on Linux | Low | `.sh` uses same MSYS2 path convention, easily adjusted |

## Success Criteria

- [ ] `patches/README.md` exists and explains both patch crates
- [ ] `cargo check` reports 0 warnings
- [ ] `scripts/cargo-mambru.sh` exists and is executable
- [ ] Clean `git status` (no modified or untracked files beyond WIP)
- [ ] `fix-rust-backend` SDD change is archived
