#!/usr/bin/env bash
# run.sh — invoke the directory-explorer POC via `rlmify run`.
# Usage: ./run.sh <path>

set -euo pipefail

TARGET="${1:?usage: run.sh <path>}"
[[ -d "$TARGET" ]] || { echo "not a directory: $TARGET" >&2; exit 1; }
TARGET_ABS="$(cd "$TARGET" && pwd)"

EXAMPLE_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$(cd "$EXAMPLE_DIR/../.." && pwd)"
PROGRAMS_DIR="$EXAMPLE_DIR/programs"

export RLMIFY_SKILL="$SKILL_DIR"
export RLMIFY_PROGRAMS="$PROGRAMS_DIR"
export RLMIFY_LOG_DIR="${RLMIFY_LOG_DIR:-/tmp/rlmify-runs/latest}"
export PATH="$SKILL_DIR/bin:$PATH"

mkdir -p "$RLMIFY_LOG_DIR"

exec rlmify run --registry-auto explore_and_summarize path="$TARGET_ABS"
