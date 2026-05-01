#!/usr/bin/env bash
# Bump the OpenProse plugin version atomically across declared files.
#
# Usage:
#   ./scripts/bump-version.sh 0.11.0     # bump every declared file to 0.11.0
#   ./scripts/bump-version.sh --check    # exit 0 iff every declared file matches
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="$REPO_ROOT/.version-bump.json"

if [[ ! -f "$CONFIG" ]]; then
  echo "error: $CONFIG not found" >&2
  exit 2
fi

mode="${1:-}"
if [[ -z "$mode" ]]; then
  echo "usage: $0 <version> | --check" >&2
  exit 2
fi

read_field() {
  local path="$1" field="$2"
  jq -r ".${field}" "$REPO_ROOT/$path"
}

write_field() {
  local path="$1" field="$2" value="$3"
  local tmp
  tmp="$(mktemp)"
  jq --arg v "$value" ".${field} = \$v" "$REPO_ROOT/$path" > "$tmp"
  mv "$tmp" "$REPO_ROOT/$path"
}

case "$mode" in
  --check)
    declared_versions=()
    while IFS= read -r entry; do
      path="$(jq -r '.path'  <<<"$entry")"
      field="$(jq -r '.field' <<<"$entry")"
      v="$(read_field "$path" "$field")"
      echo "$path:$field = $v"
      declared_versions+=("$v")
    done < <(jq -c '.files[]' "$CONFIG")
    first="${declared_versions[0]}"
    for v in "${declared_versions[@]}"; do
      if [[ "$v" != "$first" ]]; then
        echo "error: declared versions disagree (saw $v, expected $first)" >&2
        exit 1
      fi
    done
    echo "ok: all declared files at $first"
    ;;
  --*)
    echo "unknown mode: $mode" >&2
    exit 2
    ;;
  *)
    new="$mode"
    if [[ ! "$new" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
      echo "error: version must be X.Y.Z (got $new)" >&2
      exit 2
    fi
    while IFS= read -r entry; do
      path="$(jq -r '.path'  <<<"$entry")"
      field="$(jq -r '.field' <<<"$entry")"
      write_field "$path" "$field" "$new"
      echo "bumped $path:$field = $new"
    done < <(jq -c '.files[]' "$CONFIG")
    ;;
esac
