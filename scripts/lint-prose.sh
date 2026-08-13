#!/usr/bin/env bash
set -euo pipefail

# Deterministic OpenProse language gate.
#
# This is intentionally a repository script, not GitHub Actions policy. Local
# developers, agents, and any CI runner should call this same entrypoint.

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

profile="${1:-ci}"

fail() {
  echo "[lint-prose] FAIL: $*" >&2
  exit 1
}

step() {
  echo
  echo "[lint-prose] ==> $*"
  "$@" || fail "$*"
}

note() {
  echo
  echo "[lint-prose] $*"
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "required command not found: $1"
}

true_up_bin() {
  if [[ -n "${TRUE_UP_BIN:-}" ]]; then
    printf '%s\n' "$TRUE_UP_BIN"
    return 0
  fi

  if command -v true-up >/dev/null 2>&1; then
    command -v true-up
    return 0
  fi

  return 1
}

run_true_up_advisory() {
  local bin
  if ! bin="$(true_up_bin)"; then
    note "true-up not found; skipping optional drift advisory. Set TRUE_UP_BIN or put true-up on PATH to enable it."
    return 0
  fi

  note "true-up advisory checks"
  "$bin" --repo "$repo_root" --no-write build --json >/dev/null || true
  "$bin" --repo "$repo_root" --policy --report || true
}

packaged_manifest() {
  local metadata target_dir version manifest
  require_command cargo
  require_command jq
  metadata="$(cargo metadata --format-version 1 --no-deps)"
  target_dir="$(jq -r '.target_directory' <<<"$metadata")"
  version="$(jq -r '.packages[] | select(.name == "openprose-lint") | .version' <<<"$metadata")"
  [[ -n "$version" && "$version" != "null" ]] || fail "openprose-lint package missing from cargo metadata"
  manifest="$target_dir/package/openprose-lint-$version/Cargo.toml"
  [[ -f "$manifest" ]] || fail "packaged manifest not found: $manifest"
  printf '%s\n' "$manifest"
}

package_list_file() {
  local metadata target_dir
  require_command cargo
  require_command jq
  metadata="$(cargo metadata --format-version 1 --no-deps)"
  target_dir="$(jq -r '.target_directory' <<<"$metadata")"
  mkdir -p "$target_dir/package"
  printf '%s\n' "$target_dir/package/openprose-lint-package-files.txt"
}

package_allows_dirty() {
  case "${OPENPROSE_LINT_PACKAGE_CLEAN:-0}" in
    1|true|TRUE|yes|YES) return 1 ;;
    *) return 0 ;;
  esac
}

require_clean_worktree() {
  git diff --quiet -- . || fail "release package check requires a clean worktree"
  git diff --cached --quiet -- . || fail "release package check requires no staged changes"
  [[ -z "$(git ls-files --others --exclude-standard)" ]] \
    || fail "release package check requires no untracked files"
}

write_package_list() {
  local list_file count dirty_args=()
  list_file="$(package_list_file)"
  if package_allows_dirty; then
    dirty_args=(--allow-dirty)
  fi

  note "cargo package -p openprose-lint ${dirty_args[*]} --list > $list_file"
  cargo package -p openprose-lint "${dirty_args[@]}" --list >"$list_file" \
    || fail "cargo package -p openprose-lint ${dirty_args[*]} --list"
  count="$(wc -l <"$list_file" | tr -d ' ')"
  note "package file list: $count file(s) recorded at $list_file"
}

run_packaged_adapter_validations() {
  local manifest package_root adapter count=0
  manifest="$(packaged_manifest)"
  package_root="$(dirname "$manifest")"

  while IFS= read -r adapter; do
    count=$((count + 1))
    step cargo run --manifest-path "$manifest" -- adapter validate "$package_root/$adapter"
  done < <(cd "$package_root" && find specs/adapters -name '*.json' -type f | sort)

  [[ "$count" -gt 0 ]] || fail "packaged crate contains no adapter manifests"
}

usage() {
  cat >&2 <<'EOF'
Usage: scripts/lint-prose.sh [ci|advisory|package|release-package]

Profiles:
  ci               blocking deterministic gate for OpenProse main
  advisory         non-blocking discovery and optional true-up drift output
  package          review-branch crates.io dry-run; allows dirty worktrees
  release-package  clean-worktree crates.io dry-run for release commits
EOF
}

case "$profile" in
  ci)
    step cargo fmt --all --check
    step bash crates/openprose-lint/scripts/sync-spec-snapshot.sh --check
    step cargo clippy -p openprose-lint --all-targets --all-features -- -D warnings
    step cargo test -p openprose-lint
    step cargo build -p openprose-lint
    step cargo run -p openprose-lint -- specs
    step cargo run -p openprose-lint -- specs verify --spec openprose
    step cargo run -p openprose-lint -- conformance
    step cargo run -p openprose-lint -- lint --profile compat skills/open-prose/examples
    ;;
  advisory)
    step cargo run -p openprose-lint -- discover skills/open-prose packages/co packages/std
    run_true_up_advisory
    ;;
  package|release-package)
    if [[ "$profile" == "release-package" ]]; then
      export OPENPROSE_LINT_PACKAGE_CLEAN=1
    fi

    dirty_args=()
    if package_allows_dirty; then
      dirty_args=(--allow-dirty)
      note "review package mode: allowing dirty worktree for dry-run only"
    else
      note "release package mode: requiring clean worktree and omitting --allow-dirty"
      require_clean_worktree
    fi

    step bash crates/openprose-lint/scripts/sync-spec-snapshot.sh --check
    write_package_list
    step cargo publish -p openprose-lint --dry-run "${dirty_args[@]}"
    manifest="$(packaged_manifest)"
    step cargo run --manifest-path "$manifest" -- specs verify --spec openprose
    run_packaged_adapter_validations
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    usage
    exit 2
    ;;
esac
