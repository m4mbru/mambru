#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# cargo-mambru.sh — Build wrapper for Mambru on Windows (MSYS2/MinGW)
#
# Usage:  ./scripts/cargo-mambru.sh <subcommand> [args...]
# Example: ./scripts/cargo-mambru.sh check
#          ./scripts/cargo-mambru.sh test
#
# On Windows (Git Bash / MSYS2 / Cygwin), this prepends the MSYS2 ucrt64 bin
# directory to PATH so that `dlltool.exe` and other MinGW tools are found.
#
# On Linux/macOS, it runs cargo directly (the MSYS2 path is Windows-only).
# ---------------------------------------------------------------------------
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*)
    # Windows — prepend MSYS2 MinGW toolchain to PATH
    export PATH="/c/msys64/ucrt64/bin:$PATH"
    ;;
  *)
    # Linux / macOS — no special setup needed
    ;;
esac

exec cargo "$@"
