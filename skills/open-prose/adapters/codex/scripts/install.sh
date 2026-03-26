#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${1:-$(pwd)}"
CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
ADAPTER_DIR="$REPO_ROOT/skills/open-prose/adapters/codex"

mkdir -p "$CODEX_HOME/agents" "$CODEX_HOME/prompts"

cp "$ADAPTER_DIR/agents/prose_component.toml" "$CODEX_HOME/agents/"
cp "$ADAPTER_DIR/agents/prose_leaf_auditor.toml" "$CODEX_HOME/agents/"
cp "$ADAPTER_DIR/prompts/run-prose.md" "$CODEX_HOME/prompts/prose-run.md"
cp "$ADAPTER_DIR/prompts/inspect-prose.md" "$CODEX_HOME/prompts/prose-inspect.md"

python3 "$ADAPTER_DIR/scripts/build_aliases.py" \
  --root "$REPO_ROOT" \
  --out "$CODEX_HOME/prose-aliases.toml"

cat <<EOF

Installed example Codex adapter files to: $CODEX_HOME

Next steps:
1. Merge $ADAPTER_DIR/config.fragment.toml into $CODEX_HOME/config.toml
2. Restart Codex
3. Use the prompt in $CODEX_HOME/prompts/prose-run.md to execute a workflow

EOF
