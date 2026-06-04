#!/usr/bin/env bash
# Validate an OpenProse release request before dry-run or publish.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGE_NAME="@openprose/prose-cli"

version=""
npm_tag="latest"
check_remote=0
require_main=0

usage() {
  cat >&2 <<'EOF'
usage: ./scripts/release-preflight.sh --version X.Y.Z [options]

Options:
  --npm-tag latest|next  Expected npm dist-tag. Defaults to latest.
  --check-remote         Check git tag, GitHub Release, and npm version availability.
  --require-main         Require the workflow or local branch to be main.
EOF
}

fail() {
  printf 'release preflight: %s\n' "$*" >&2
  exit 1
}

need_command() {
  command -v "$1" >/dev/null 2>&1 || fail "required command not found: $1"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version)
      version="${2:-}"
      shift 2
      ;;
    --npm-tag)
      npm_tag="${2:-}"
      shift 2
      ;;
    --check-remote)
      check_remote=1
      shift
      ;;
    --require-main)
      require_main=1
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

[[ "$version" =~ ^v?[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail "version must be X.Y.Z"
version="${version#v}"

case "$npm_tag" in
  latest|next) ;;
  *) fail "npm tag must be latest or next" ;;
esac

need_command jq
need_command npm

if [[ "$require_main" -eq 1 ]]; then
  if [[ -n "${GITHUB_REF:-}" ]]; then
    [[ "$GITHUB_REF" == "refs/heads/main" ]] || fail "release must run from main, not $GITHUB_REF"
  else
    branch="$(git -C "$REPO_ROOT" branch --show-current)"
    [[ "$branch" == "main" ]] || fail "release must run from main, not $branch"
  fi
fi

# This preflight publishes @openprose/prose-cli, so it validates the `cli` track
# only. The `skill` plugin/SKILL track versions independently (see RELEASE.md) and
# must not be required to match a CLI release version.
(
  cd "$REPO_ROOT"
  ./scripts/bump-version.sh --check --track cli >/tmp/openprose-release-version-check.txt
)
cat /tmp/openprose-release-version-check.txt

while IFS= read -r line; do
  field_version="${line##*= }"
  [[ "$field_version" == "$version" ]] || fail "$line does not match requested version $version"
done < <(grep ' = ' /tmp/openprose-release-version-check.txt)

(
  cd "$REPO_ROOT"
  ./scripts/sync-copy.sh --check
)

"$REPO_ROOT/scripts/extract-changelog.sh" "$version" >/tmp/openprose-release-notes.md
[[ -s /tmp/openprose-release-notes.md ]] || fail "CHANGELOG.md has no section for $version"

release_tag="v$version"

if [[ "$check_remote" -eq 1 ]]; then
  need_command gh
  need_command git

  if git -C "$REPO_ROOT" ls-remote --exit-code --tags origin "refs/tags/$release_tag" >/dev/null 2>&1; then
    fail "git tag already exists: $release_tag"
  fi

  if gh release view "$release_tag" --repo openprose/prose >/dev/null 2>&1; then
    fail "GitHub Release already exists: $release_tag"
  fi

  if npm view "$PACKAGE_NAME@$version" version >/tmp/openprose-npm-version 2>/dev/null; then
    published_version="$(cat /tmp/openprose-npm-version)"
    fail "npm package version already exists: $PACKAGE_NAME@$published_version"
  fi
fi

printf 'ok: OpenProse release %s is ready for %s preflight\n' "$version" "$npm_tag"
