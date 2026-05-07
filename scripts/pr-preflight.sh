#!/usr/bin/env bash
# Validate a PR branch against the current upstream base before pushing or merging.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

base_ref="${OPENPROSE_PR_BASE_REF:-origin/main}"
fetch_base=1
run_smoke=1

usage() {
  cat >&2 <<'EOF'
usage: ./scripts/pr-preflight.sh [options]

Options:
  --base REF        Base ref to merge against. Defaults to origin/main.
  --no-fetch        Do not fetch origin/main before validating.
  --no-smoke        Skip OpenProse smoke dry-run.
EOF
}

fail() {
  printf 'pr preflight: %s\n' "$*" >&2
  exit 1
}

need_command() {
  command -v "$1" >/dev/null 2>&1 || fail "required command not found: $1"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base)
      base_ref="${2:-}"
      shift 2
      ;;
    --no-fetch)
      fetch_base=0
      shift
      ;;
    --no-smoke)
      run_smoke=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      usage
      fail "unknown argument: $1"
      ;;
  esac
done

[[ -n "$base_ref" ]] || fail "--base must not be empty"

need_command git
need_command npm
need_command node

if ! node --help 2>&1 | grep -q -- '--check'; then
  fail "node on PATH does not support --check; put Node.js before any compatibility shim on PATH"
fi

cd "$REPO_ROOT"

if ! git diff --quiet; then
  fail "tracked working tree changes are present; commit or stash them before preflight"
fi

if ! git diff --cached --quiet; then
  fail "staged changes are present; commit or unstage them before preflight"
fi

if [[ "$fetch_base" -eq 1 ]]; then
  git fetch origin main:refs/remotes/origin/main
fi

head_ref="$(git rev-parse --verify HEAD)"
worktree="$(mktemp -d "${TMPDIR:-/tmp}/openprose-pr-preflight.XXXXXX")"

cleanup() {
  git -C "$REPO_ROOT" worktree remove --force "$worktree" >/dev/null 2>&1 || true
}
trap cleanup EXIT

git worktree add --detach "$worktree" "$base_ref" >/dev/null
git -C "$worktree" merge --no-commit --no-ff "$head_ref"

cd "$worktree"

git diff --check

if command -v actionlint >/dev/null 2>&1; then
  actionlint .github/workflows/cli-*.yml .github/workflows/plugin-manifest.yml .github/workflows/openprose-smoke.yml .github/workflows/release.yml
elif command -v go >/dev/null 2>&1; then
  go run github.com/rhysd/actionlint/cmd/actionlint@v1.7.7 .github/workflows/cli-*.yml .github/workflows/plugin-manifest.yml .github/workflows/openprose-smoke.yml .github/workflows/release.yml
else
  fail "actionlint or go is required for workflow linting"
fi

bash -n tools/cli/install.sh
node --check tools/cli/scripts/build-release-tarball.mjs
node --check tools/cli/scripts/smoke-harness.mjs
node --check tools/cli/scripts/audit-policy.mjs
bash -n scripts/bump-version.sh
bash -n scripts/pr-preflight.sh
bash -n scripts/release-preflight.sh

./scripts/bump-version.sh --check
./scripts/sync-copy.sh --check

cd "$worktree/tools/cli"
npm ci
npm run ci:pr

cd "$worktree"
if [[ "$run_smoke" -eq 1 ]]; then
  tools/cli/node_modules/.bin/tsx .github/scripts/openprose-smoke/run.ts \
    --dry-run \
    --tier required \
    --force \
    --results-dir openprose-smoke-results-local
fi

printf 'ok: PR preflight passed against %s\n' "$base_ref"
