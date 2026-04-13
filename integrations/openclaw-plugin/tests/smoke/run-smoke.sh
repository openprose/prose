#!/usr/bin/env bash
# Smoke test: exercise the OpenProse plugin via OpenClaw CLI.
# Requires: openclaw gateway running, openprose plugin installed.
#
# Usage: ./tests/smoke/run-smoke.sh

set -euo pipefail

SESSION="test:openprose-smoke-$(date +%s)"
TIMEOUT=60
PASS=0
FAIL=0

run_test() {
  local name="$1"
  local message="$2"
  local expect="$3"

  echo -n "  $name ... "
  local result
  result=$(openclaw agent --session-id "$SESSION" -m "$message" --json --timeout "$TIMEOUT" 2>/dev/null)

  local text
  text=$(echo "$result" | jq -r '.result.payloads[0].text // .result.text // "NO_OUTPUT"' 2>/dev/null || echo "PARSE_ERROR")

  if echo "$text" | grep -qi "$expect"; then
    echo "PASS"
    PASS=$((PASS + 1))
  else
    echo "FAIL (expected '$expect' in output)"
    echo "    Got: ${text:0:200}"
    FAIL=$((FAIL + 1))
  fi
}

echo "OpenProse Plugin Smoke Tests"
echo "Session: $SESSION"
echo ""

run_test "/prose help"      "/prose help"       "OpenProse"
run_test "/prose status"    "/prose status"     "Runtime Status"
run_test "/prose examples"  "/prose examples"   "hello"
run_test "/prose unknown"   "/prose foobar"     "Unknown command"

echo ""
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
