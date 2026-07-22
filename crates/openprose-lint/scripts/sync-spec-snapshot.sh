#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
source_dir="$repo_root/skills/open-prose"
snapshot_dir="$repo_root/crates/openprose-lint/spec-snapshot/openprose/skills/open-prose"
# The package snapshot is a curated spec bundle, not a mirror of the full
# skill/examples tree. Keep it to the files needed for packaged Cargo builds,
# source identity, and linked core language docs.
snapshot_files=(
  "SKILL.md"
  "compiler/index.prose.md"
  "compiler/ir-v0.md"
  "concepts/README.md"
  "concepts/reactor.md"
  "concepts/responsibility.md"
  "contract-markdown.md"
  "deps.md"
  "forme.md"
  "guidance/README.md"
  "guidance/system-prompt.md"
  "guidance/tenets.md"
  "primitives/README.md"
  "primitives/session.md"
  "prose.md"
  "prosescript.md"
  "reactor.md"
  "responsibility-runtime.md"
  "state/README.md"
  "state/filesystem.md"
  "state/in-context.md"
  "state/postgres.md"
  "state/sqlite.md"
  "visual-source.md"
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

  --check  verify the packaged OpenProse spec bundle matches selected source files
  --sync   refresh the packaged spec bundle from selected source files
EOF
}

snapshot_file_list() {
  printf '%s\n' "${snapshot_files[@]}" | sort
}

check_snapshot_file_set() {
  diff -u \
    <(snapshot_file_list) \
    <(cd "$snapshot_dir" && find . -type f | sed 's#^\./##' | sort) \
    || fail "snapshot contains files outside the curated spec bundle; run --sync"
}

check_snapshot_contents() {
  local rel
  for rel in "${snapshot_files[@]}"; do
    [[ -f "$source_dir/$rel" ]] || fail "source file missing: $source_dir/$rel"
    [[ -f "$snapshot_dir/$rel" ]] || fail "snapshot file missing: $snapshot_dir/$rel; run --sync"
    cmp -s "$source_dir/$rel" "$snapshot_dir/$rel" \
      || fail "snapshot file differs from source: $rel; run --sync"
  done
}

sync_snapshot() {
  local rel
  rm -rf "$snapshot_dir"
  mkdir -p "$snapshot_dir"
  for rel in "${snapshot_files[@]}"; do
    [[ -f "$source_dir/$rel" ]] || fail "source file missing: $source_dir/$rel"
    mkdir -p "$snapshot_dir/$(dirname "$rel")"
    cp -p "$source_dir/$rel" "$snapshot_dir/$rel"
  done
}

case "${1:---check}" in
  --check)
    require_source
    [[ -d "$snapshot_dir" ]] || fail "snapshot directory not found: $snapshot_dir; run --sync"
    check_snapshot_file_set
    check_snapshot_contents
    ;;
  --sync)
    require_source
    sync_snapshot
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    usage
    exit 2
    ;;
esac
