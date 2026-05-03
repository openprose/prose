#!/usr/bin/env bash
# Sync canonical plugin copy across declared manifest files.
#
# Usage:
#   ./scripts/sync-copy.sh         # write canonical copy into every declared destination
#   ./scripts/sync-copy.sh --check # exit 0 iff every destination already matches
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="$REPO_ROOT/.plugin-meta.json"

if [[ ! -f "$CONFIG" ]]; then
  echo "error: $CONFIG not found" >&2
  exit 2
fi

mode="${1:-write}"

pointer_to_jq() {
  # "interface.shortDescription"  -> ".interface.shortDescription"
  # "plugins[0].description"      -> ".plugins[0].description"
  printf '.%s' "$1"
}

read_field() {
  local path="$1" jq_expr="$2"
  jq -r "$jq_expr" "$REPO_ROOT/$path"
}

write_field() {
  local path="$1" jq_expr="$2" value="$3"
  local tmp
  tmp="$(mktemp)"
  jq --arg v "$value" "${jq_expr} = \$v" "$REPO_ROOT/$path" > "$tmp"
  mv "$tmp" "$REPO_ROOT/$path"
}

slots=(tagline shortDescription longDescription)

case "$mode" in
  --check)
    drift=0
    for slot in "${slots[@]}"; do
      expected="$(jq -r ".${slot}" "$CONFIG")"
      while IFS= read -r entry; do
        path="$(jq -r '.path' <<<"$entry")"
        pointer="$(jq -r '.pointer' <<<"$entry")"
        jq_expr="$(pointer_to_jq "$pointer")"
        actual="$(read_field "$path" "$jq_expr")"
        if [[ "$actual" != "$expected" ]]; then
          echo "drift: $path:$pointer" >&2
          echo "  expected: $expected" >&2
          echo "  actual:   $actual" >&2
          drift=1
        fi
      done < <(jq -c ".targets.${slot}[]" "$CONFIG")
    done
    if [[ $drift -ne 0 ]]; then
      exit 1
    fi
    echo "ok: all declared destinations in sync"
    ;;
  write)
    for slot in "${slots[@]}"; do
      value="$(jq -r ".${slot}" "$CONFIG")"
      while IFS= read -r entry; do
        path="$(jq -r '.path' <<<"$entry")"
        pointer="$(jq -r '.pointer' <<<"$entry")"
        jq_expr="$(pointer_to_jq "$pointer")"
        write_field "$path" "$jq_expr" "$value"
        echo "wrote $path:$pointer"
      done < <(jq -c ".targets.${slot}[]" "$CONFIG")
    done
    ;;
  *)
    echo "usage: $0 [--check]" >&2
    exit 2
    ;;
esac
