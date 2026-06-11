# Patches: Vendored whisper-rs Crates

## Why

`whisper-rs` v0.16.0 and `whisper-rs-sys` v0.15.0 are vendored here because the
upstream crates fail to link on `x86_64-pc-windows-gnu` (MSYS2 MinGW) with
undefined references to `std::codecvt<wchar_t, ...>` and its virtual methods
(`do_out`, `do_in`, `do_unshift`, `do_length`).

The error manifests as:

```
undefined reference to `std::codecvt<wchar_t, char, _Mbstatet>::codecvt(unsigned long long)'
```

This is a toolchain ABI mismatch between the C++ code compiled by `whisper.cpp`
(which uses the MSVC-style codecvt) and the Rust GNU target's expectation.
Vendoring allows us to control the build flags and compilation environment.

## What Changed

The vendored crates are **unmodified copies** of the upstream release with
one difference:

- `whisper-rs-sys/Cargo.toml` — added `rust-version = "1.88.0"` (upstream
  doesn't set it; this aligns with the Rust 2024 edition MSRV policy)
- The crate is pinned via `[patch.crates-io]` in `src-tauri/Cargo.toml`

If there are any source changes in the future, they will be tracked here.

## Caveats

- The patches include the full `whisper.cpp` C++ source tree (via
  `whisper-rs-sys/whisper.cpp/`). This is ~50MB and adds to clone time.
- Only the `whisper-rs-sys` FFI layer needs the C++ compiler; `whisper-rs` is
  pure Rust.

## Upgrading

To upgrade to a newer `whisper-rs` release:

1. Remove `[patch.crates-io]` from `src-tauri/Cargo.toml`
2. Run `cargo update` to fetch the upstream version
3. Try to build: `cargo check`
4. If the codecvt linker error is **fixed** upstream, delete this directory
   and the `[patch.crates-io]` section permanently
5. If the error **persists**, re-vendor:
   ```bash
   # Download the crate source
   cargo download whisper-rs@<new-version> --extract patches/
   cargo download whisper-rs-sys@<new-version> --extract patches/
   # Re-add the rust-version field to whisper-rs-sys/Cargo.toml
   # Restore [patch.crates-io] in src-tauri/Cargo.toml
   ```
