# 010 Current Launch Evidence Refresh

Date: 2026-04-27

## What Changed

- Refreshed committed measurement reports under `docs/measurements/`.
- Re-ran the deterministic runtime confidence ladder.
- Re-ran the full Bun test suite, binary smoke, cold-start smoke,
  agent-onboarding smoke, hosted-contract smoke, and launch evidence export.
- Re-ran the opt-in live Pi ladder with OpenRouter
  `google/gemini-3-flash-preview` across cheap, medium, and complex tiers.

## Validation

```bash
bun run confidence:runtime
bun run typecheck
bun run test
bun run smoke:binary
bun run smoke:cold-start
bun run smoke:agent-onboarding
bun run smoke:hosted-contract
OPENPROSE_LIVE_PI_SMOKE=1 \
OPENROUTER_API_KEY=... \
OPENPROSE_PI_API_KEY=... \
bun run smoke:live-pi -- --tier all --run-root .prose/live-pi-runs
bun run evidence:launch
git diff --check
```

## Result

- Runtime confidence: pass, 20 checks.
- Full test suite: pass, 282 pass, 1 skipped live-Pi unit smoke.
- Binary smoke: pass.
- Cold-start smoke: pass, 6 checks.
- Agent onboarding smoke: pass, 9 checks.
- Hosted contract smoke: pass, 7 tests.
- Launch evidence: pass.
- Live Pi smoke: succeeded across all selected tiers:
  - cheap `company-signal-brief`: 1 session, 65 trace events.
  - medium `lead-program-designer`: 3 sessions, 140 trace events.
  - complex `stargazer-intake-lite`: 5 sessions, 175 trace events.

## Next

- Keep the current measurement reports committed as the OSS launch evidence
  baseline.
- If later code changes affect runtime, package, example, or evidence behavior,
  rerun this ladder before updating the technical report or platform evidence
  index.
