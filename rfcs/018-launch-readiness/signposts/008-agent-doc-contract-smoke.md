# Signpost 008: Agent Doc Contract Smoke

Date: 2026-04-27
Branch: `rfc/reactive-openprose`

## Summary

Strengthened the agent-onboarding smoke so it now guards the public
first-ten-minute narrative, not just the executable CLI loop.

Changed:

- `scripts/agent-onboarding-smoke.ts` now checks seven launch-facing docs:
  - `README.md`
  - `docs/README.md`
  - `docs/agent-onboarding.md`
  - `docs/inference-examples.md`
  - `docs/why-and-when.md`
  - `examples/README.md`
  - `skills/open-prose/SKILL.md`
- The smoke asserts 36 concrete launch-contract phrases covering:
  - OpenProse as contract-first reactive software
  - Pi as the local graph VM and meta-harness substrate
  - OpenRouter as a Pi runtime-profile model provider
  - single-run handoff as separate from reactive graph execution
  - durable runs, status, traces, packages, publish checks, cold-start, and live
    Pi evidence
- `docs/measurements/agent-onboarding.latest.*` now records
  `doc_contract_checks` alongside the nine executable onboarding checks.

This makes the docs harder to accidentally drift back into older runtime
vocabulary while keeping the public surface small and readable.

## Tests

Passed:

```bash
bun run smoke:agent-onboarding
bun run typecheck
bun run test
bun run confidence:runtime
bun run evidence:launch
bun run smoke:binary
git diff --check
```

Observed:

- Typecheck passed.
- Test suite passed: 282 pass, 1 intentionally skipped live Pi smoke, 0 fail.
- Runtime confidence passed: 20 checks.
- Launch evidence passed.

## Next

Update the platform submodule pointer and launch signpost so the hosted branch
tracks this OSS launch guard. Then keep looping from the North Star: prefer
small, high-leverage polish that makes the OSS package and hosted dev surface
easier to trust without expanding feature scope.
