#!/usr/bin/env bash
# Sync canonical plugin copy across declared manifest files.
#
# Usage:
#   ./scripts/sync-copy.sh         # write canonical copy into every declared destination
#   ./scripts/sync-copy.sh --check # exit 0 iff every destination already matches
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="$REPO_ROOT/.plugin-meta.json"

# Manifest paths and pointers are data, not trusted shell or jq programs.
# Reject traversal, symlink targets, and filter syntax outside the small
# property/index grammar used by this repository.
repo_file() {
  local path="$1" parent base parent_abs
  if [[ -z "$path" || "$path" == /* || "$path" =~ (^|/)\.\.?(/|$) || "$path" == *$'\n'* || "$path" == *$'\r'* ]]; then
    echo "error: unsafe repository path: $path" >&2
    exit 2
  fi
  parent="${path%/*}"
  [[ "$parent" == "$path" ]] && parent="."
  base="${path##*/}"
  parent_abs="$(cd "$REPO_ROOT/$parent" 2>/dev/null && pwd -P)" || {
    echo "error: repository path parent does not exist: $path" >&2
    exit 2
  }
  case "$parent_abs" in
    "$REPO_ROOT"|"$REPO_ROOT"/*) ;;
    *) echo "error: repository path escapes checkout: $path" >&2; exit 2 ;;
  esac
  if [[ -L "$parent_abs/$base" ]]; then
    echo "error: refusing symlink target: $path" >&2
    exit 2
  fi
  printf '%s/%s\n' "$parent_abs" "$base"
}

validate_pointer() {
  local pointer="$1"
  if [[ ! "$pointer" =~ ^[A-Za-z_][A-Za-z0-9_]*(\[[0-9]+\]|\.[A-Za-z_][A-Za-z0-9_]*)*$ ]]; then
    echo "error: unsafe jq pointer: $pointer" >&2
    exit 2
  fi
}

if [[ ! -f "$CONFIG" ]]; then
  echo "error: $CONFIG not found" >&2
  exit 2
fi

mode="${1:-write}"

pointer_to_jq() {
  # "interface.shortDescription"  -> ".interface.shortDescription"
  # "plugins[0].description"      -> ".plugins[0].description"
  validate_pointer "$1"
  printf '.%s' "$1"
}

read_field() {
  local path="$1" jq_expr="$2"
  jq -r "$jq_expr" "$(repo_file "$path")"
}

write_field() {
  local path="$1" jq_expr="$2" value="$3"
  local tmp
  tmp="$(mktemp)"
  local target
  target="$(repo_file "$path")"
  jq --arg v "$value" "${jq_expr} = \$v" "$target" > "$tmp"
  mv "$tmp" "$target"
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
