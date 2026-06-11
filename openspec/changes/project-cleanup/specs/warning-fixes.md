# Spec: Fix Rust dead-code warnings

## Requirement

`cargo check` MUST produce 0 warnings in the `mambru` crate.

## Acceptance

- `cargo check` shows no warnings
- No change in test behavior (Rust tests, when runnable, still pass)
- For functions that are public API or testing infrastructure: use `#[allow(dead_code)]`
- For functions that are truly unused and not needed: prefix with `_` or remove
