#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
source_dir="$repo_root/skills/open-prose"
snapshot_dir="$repo_root/crates/openprose-lint/spec-snapshot/openprose/skills/open-prose"
# The package snapshot is the authored OpenProse language surface. Generated
# example outputs can appear during install/test runs and must not become part of
# the crate's source identity.
snapshot_excludes=(
  "dist"
)

fail() {
  echo "[sync-spec-snapshot] FAIL: $*" >&2
  exit 1
}

require_source() {
  [[ -d "$source_dir" ]] || fail "source directory not found: $source_dir"
}

usage() {
  cat >&2 <<'EOF'
Usage: crates/openprose-lint/scripts/sync-spec-snapshot.sh [--check|--sync]

  --check  verify the packaged OpenProse spec snapshot matches skills/open-prose
  --sync   refresh the packaged snapshot from skills/open-prose
EOF
}

case "${1:---check}" in
  --check)
    require_source
    [[ -d "$snapshot_dir" ]] || fail "snapshot directory not found: $snapshot_dir; run --sync"
    diff_args=(-qr)
    for pattern in "${snapshot_excludes[@]}"; do
      diff_args+=(--exclude="$pattern")
    done
    diff "${diff_args[@]}" "$source_dir" "$snapshot_dir"
    ;;
  --sync)
    require_source
    command -v rsync >/dev/null 2>&1 || fail "required command not found: rsync"
    mkdir -p "$snapshot_dir"
    rsync_args=(-a --delete --delete-excluded)
    for pattern in "${snapshot_excludes[@]}"; do
      rsync_args+=(--exclude="$pattern/")
    done
    rsync "${rsync_args[@]}" "$source_dir/" "$snapshot_dir/"
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    usage
    exit 2
    ;;
esac
