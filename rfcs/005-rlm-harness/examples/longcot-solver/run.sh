#!/usr/bin/env bash
# run.sh — invoke the longcot-solver POC via `rlmify run`.
# Usage: ./run.sh <path-to-prompt.txt>
#
# Reads a LongCoT problem prompt from a file and solves it in a single
# depth-0 rlmify node. Prints a pretty-printed delta JSON on stdout; the
# answer value lives at `.delta.solution`.

set -euo pipefail

PROMPT_FILE="${1:?usage: run.sh <path-to-prompt.txt>}"
[[ -f "$PROMPT_FILE" ]] || { echo "not a file: $PROMPT_FILE" >&2; exit 1; }
PROMPT_ABS="$(cd "$(dirname "$PROMPT_FILE")" && pwd)/$(basename "$PROMPT_FILE")"

EXAMPLE_DIR="$(cd "$(dirname "$0")" && pwd)"
# example lives in rfcs/005-rlm-harness/examples/<name>/, skill is in skills/rlmify/
REPO_ROOT="$(cd "$EXAMPLE_DIR/../../../.." && pwd)"
SKILL_DIR="$REPO_ROOT/skills/rlmify"
PROGRAMS_DIR="$EXAMPLE_DIR/programs"

export RLMIFY_SKILL="$SKILL_DIR"
export RLMIFY_PROGRAMS="$PROGRAMS_DIR"
export RLMIFY_LOG_DIR="${RLMIFY_LOG_DIR:-/tmp/rlmify-runs/longcot-solver-latest}"
export PATH="$SKILL_DIR/bin:$PATH"

mkdir -p "$RLMIFY_LOG_DIR"

exec rlmify run --registry-auto solve_longcot_problem prompt_file="$PROMPT_ABS"
