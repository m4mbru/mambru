# Tasks: project-cleanup

## Review Workload Forecast

Decision needed before apply: No
Chained PRs recommended: No
400-line budget risk: No

~80 lines across 7 files. Well under the 400-line limit.

## Tasks

- [ ] 1. Create `src-tauri/patches/README.md` with Why / What Changed / Upgrading sections
- [ ] 2. Add `#[allow(dead_code)]` to 5 Rust modules (audit.rs, classifier.rs, builder.rs, registry.rs, stt.rs)
- [ ] 3. Create `scripts/cargo-mambru.sh` equivalent of the .bat wrapper
- [ ] 4. Verify: `cargo check` has 0 warnings
- [ ] 5. Git commit all changes
- [ ] 6. Archive SDD change `fix-rust-backend`
