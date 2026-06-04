#!/usr/bin/env bash
# Bump OpenProse version surfaces, one independently-released TRACK at a time.
#
# Tracks are declared in .version-bump.json. Each track's files are kept in
# lockstep with each other; tracks move independently of one another (e.g. the
# `skill` plugin/SKILL track and the `cli` package track release separately).
#
# Usage:
#   ./scripts/bump-version.sh --track skill 0.15.0  # bump one track's files
#   ./scripts/bump-version.sh --check               # every track internally consistent
#   ./scripts/bump-version.sh --check --track cli   # one track internally consistent
#   ./scripts/bump-version.sh --list                # print each track's resolved version
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="$REPO_ROOT/.version-bump.json"

if [[ ! -f "$CONFIG" ]]; then
  echo "error: $CONFIG not found" >&2
  exit 2
fi

usage() {
  cat >&2 <<'EOF'
usage:
  bump-version.sh --track <name> <X.Y.Z>   bump one track's files
  bump-version.sh --check [--track <name>] check tracks are internally consistent
  bump-version.sh --list                   print each track's resolved version
EOF
}

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

track_exists() {
  jq -e --arg t "$1" '.tracks | has($t)' "$CONFIG" >/dev/null 2>&1
}

all_tracks() {
  jq -r '.tracks | keys[]' "$CONFIG"
}

# Read every file in a track, printing `path:field = version` lines, and assert
# they all agree. Echoes the agreed version on success; exits 1 on disagreement.
check_track() {
  local track="$1"
  local versions=() path field kind v first
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
    versions+=("$v")
  done < <(jq -c --arg t "$track" '.tracks[$t].files[]' "$CONFIG")
  first="${versions[0]}"
  for v in "${versions[@]}"; do
    if [[ "$v" != "$first" ]]; then
      echo "error: track '$track' versions disagree (saw $v, expected $first)" >&2
      exit 1
    fi
  done
  echo "ok: track '$track' at $first"
}

bump_track() {
  local track="$1" new="$2" path field kind
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
  done < <(jq -c --arg t "$track" '.tracks[$t].files[]' "$CONFIG")
}

# ---------------------------------------------------------------------------
# Parse args: --check, --track <name>, --list, or a bare X.Y.Z version.
# ---------------------------------------------------------------------------
mode=""
track=""
version=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --check) mode="check"; shift ;;
    --list)  mode="list";  shift ;;
    --track)
      track="${2:-}"
      [[ -n "$track" ]] || { echo "error: --track needs a name" >&2; exit 2; }
      shift 2
      ;;
    -h|--help) usage; exit 0 ;;
    --*) echo "error: unknown flag: $1" >&2; usage; exit 2 ;;
    *)
      [[ -z "$version" ]] || { echo "error: unexpected argument: $1" >&2; exit 2; }
      version="$1"; shift
      ;;
  esac
done

if [[ -n "$track" ]] && ! track_exists "$track"; then
  echo "error: unknown track '$track' (have: $(all_tracks | paste -sd, -))" >&2
  exit 2
fi

# A bare version means a bump; it now REQUIRES a track (tracks release separately).
if [[ -z "$mode" && -n "$version" ]]; then
  mode="bump"
fi

case "$mode" in
  check)
    if [[ -n "$track" ]]; then
      check_track "$track"
    else
      while IFS= read -r t; do
        check_track "$t"
      done < <(all_tracks)
    fi
    ;;
  list)
    while IFS= read -r t; do
      v="$(check_track "$t" | sed -n "s/^ok: track '$t' at //p")"
      printf '%s = %s\n' "$t" "$v"
    done < <(all_tracks)
    ;;
  bump)
    if [[ -z "$track" ]]; then
      echo "error: a bump needs an explicit --track (tracks release independently)" >&2
      usage
      exit 2
    fi
    bump_track "$track" "$version"
    ;;
  *)
    usage
    exit 2
    ;;
esac
