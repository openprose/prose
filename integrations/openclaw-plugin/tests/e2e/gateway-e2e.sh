#!/usr/bin/env bash
# E2E tests: exercise /prose commands through the OpenClaw gateway.
#
# Requires:
#   - OpenClaw gateway running with openprose plugin loaded
#   - Telegram channel configured (messages are sent to your Telegram chat)
#
# Usage: ./tests/e2e/gateway-e2e.sh [telegram-chat-id]
#
# The test sends /prose commands via `openclaw message send --channel telegram`
# which routes through the gateway's plugin command dispatch. This is the same
# path as a real Telegram user typing commands.

set -euo pipefail

CHAT_ID="${1:?Usage: $0 <telegram-chat-id>}"
PASS=0
FAIL=0
TOTAL=0

run_test() {
  local name="$1"
  local message="$2"
  local expect_handled="$3"  # "plugin" or "agent"

  TOTAL=$((TOTAL + 1))
  echo -n "  [$TOTAL] $name ... "

  local result
  result=$(openclaw message send --channel telegram --target "$CHAT_ID" \
    --message "$message" --json 2>/dev/null) || {
    echo "FAIL (command error)"
    FAIL=$((FAIL + 1))
    return
  }

  local handled
  handled=$(echo "$result" | python3 -c "import json,sys; print(json.load(sys.stdin).get('handledBy','unknown'))" 2>/dev/null)

  local ok
  ok=$(echo "$result" | python3 -c "import json,sys; print(json.load(sys.stdin).get('payload',{}).get('ok',False))" 2>/dev/null)

  if [ "$handled" = "$expect_handled" ] && [ "$ok" = "True" ]; then
    echo "PASS (handledBy=$handled)"
    PASS=$((PASS + 1))
  else
    echo "FAIL (expected handledBy=$expect_handled, got handledBy=$handled, ok=$ok)"
    FAIL=$((FAIL + 1))
  fi
}

echo "OpenProse E2E Tests (gateway + Telegram)"
echo "Chat ID: $CHAT_ID"
echo ""

# Verify gateway is healthy first
if ! openclaw health >/dev/null 2>&1; then
  echo "FATAL: Gateway not running. Start with: openclaw gateway --force"
  exit 1
fi

# Verify openprose plugin is loaded
if ! openclaw plugins list 2>&1 | grep -q "openprose"; then
  echo "FATAL: openprose plugin not loaded."
  exit 1
fi

echo "Gateway healthy, openprose plugin loaded."
echo ""

# ── Plugin command tests (handledBy: plugin) ──
run_test "/prose help"         "/prose help"       "plugin"
run_test "/prose status"       "/prose status"     "plugin"
run_test "/prose examples"     "/prose examples"   "plugin"
run_test "/prose examples 01"  "/prose examples 01" "plugin"
run_test "/prose compile"      "/prose compile"    "plugin"
run_test "/prose unknown cmd"  "/prose xyzzy"      "plugin"

# ── /prose run with hello-world (creates real run directory) ──
HELLO_MD="$(cd "$(dirname "$0")/../smoke" && pwd)/hello-world.md"
if [ -f "$HELLO_MD" ]; then
  run_test "/prose run hello-world" "/prose run $HELLO_MD" "plugin"

  # Verify run directory was created
  TOTAL=$((TOTAL + 1))
  echo -n "  [$TOTAL] Run directory created ... "
  # Find the newest run directory
  LATEST_RUN=$(find "$HOME"/.openclaw/extensions/openprose/.prose/runs/ \
    "$HOME"/clawd/.prose/runs/ \
    -maxdepth 1 -mindepth 1 -type d 2>/dev/null | \
    sort -r | head -1)

  if [ -n "$LATEST_RUN" ] && [ -f "$LATEST_RUN/program.md" ] && [ -f "$LATEST_RUN/state.md" ]; then
    echo "PASS ($LATEST_RUN)"
    PASS=$((PASS + 1))
  else
    echo "FAIL (no run directory with program.md + state.md found)"
    FAIL=$((FAIL + 1))
  fi
else
  echo "  SKIP: hello-world.md not found at $HELLO_MD"
fi

echo ""
echo "Results: $PASS/$TOTAL passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
