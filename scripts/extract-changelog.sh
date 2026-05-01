#!/usr/bin/env bash
# Print the body of the `## [X.Y.Z]` block from CHANGELOG.md.
# Usage: ./scripts/extract-changelog.sh 0.10.0
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 <version>" >&2
  exit 2
fi
version="$1"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
changelog="$REPO_ROOT/CHANGELOG.md"

awk -v v="[${version}]" '
  index($0, "## " v) == 1 {found=1; next}
  found && /^## / {exit}
  found {print}
' "$changelog" | sed '1{/^$/d;}'
