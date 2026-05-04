#!/usr/bin/env bash
# Bump the OpenProse release version atomically across declared files.
#
# Usage:
#   ./scripts/bump-version.sh 0.13.0     # bump every declared file to 0.13.0
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

json_expr() {
  printf '.%s' "$1"
}

read_field() {
  local path="$1" kind="$2" field="$3"
  case "$kind" in
    json)
      jq -r "$(json_expr "$field")" "$REPO_ROOT/$path"
      ;;
    shell-var)
      sed -n "s/^${field}=\"\\([^\"]*\\)\"/\\1/p" "$REPO_ROOT/$path"
      ;;
    yaml)
      sed -n "s/^${field}: *\\([^ ]*\\).*$/\\1/p" "$REPO_ROOT/$path" | sed -n '1p'
      ;;
    *)
      echo "error: unknown version field kind: $kind" >&2
      exit 2
      ;;
  esac
}

write_field() {
  local path="$1" kind="$2" field="$3" value="$4"
  local tmp
  tmp="$(mktemp)"
  case "$kind" in
    json)
      jq --arg v "$value" "$(json_expr "$field") = \$v" "$REPO_ROOT/$path" > "$tmp"
      mv "$tmp" "$REPO_ROOT/$path"
      ;;
    shell-var)
      sed "s/^${field}=\"[^\"]*\"/${field}=\"$value\"/" "$REPO_ROOT/$path" > "$tmp"
      mv "$tmp" "$REPO_ROOT/$path"
      ;;
    yaml)
      sed "s/^${field}: .*$/${field}: $value/" "$REPO_ROOT/$path" > "$tmp"
      mv "$tmp" "$REPO_ROOT/$path"
      ;;
    *)
      rm -f "$tmp"
      echo "error: unknown version field kind: $kind" >&2
      exit 2
      ;;
  esac
}

case "$mode" in
  --check)
    declared_versions=()
    while IFS= read -r entry; do
      path="$(jq -r '.path'  <<<"$entry")"
      field="$(jq -r '.field' <<<"$entry")"
      kind="$(jq -r '.kind // "json"' <<<"$entry")"
      v="$(read_field "$path" "$kind" "$field")"
      if [[ -z "$v" || "$v" == "null" ]]; then
        echo "error: could not read $path:$field" >&2
        exit 1
      fi
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
      kind="$(jq -r '.kind // "json"' <<<"$entry")"
      write_field "$path" "$kind" "$field" "$new"
      echo "bumped $path:$field = $new"
    done < <(jq -c '.files[]' "$CONFIG")
    ;;
esac
