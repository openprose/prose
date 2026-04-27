# Signpost 003: Agent Onboarding Smoke

Date: 2026-04-27
Branch: `rfc/reactive-openprose`

## Summary

Made coding-agent onboarding a measured surface.

Added:

- `docs/agent-onboarding.md`
- `bun run smoke:agent-onboarding`
- generated reports under `docs/measurements/agent-onboarding.latest.*`
- runtime confidence matrix coverage as check 20

The smoke runs the first operator loop a coding agent should use when entering
the repo cold: help, lint, preflight, graph, run, status, trace, package, and
strict publish-check.

## Tests

Passed:

```bash
bun run smoke:agent-onboarding
bun test test/binary-package.test.ts test/docs-public.test.ts
bun run typecheck
bun run confidence:runtime
```

Current generated evidence:

- agent onboarding smoke: pass, 9 checks
- runtime confidence: pass, 20 checks, 15710ms

## Next

Proceed to launch readiness `R003`: make technical-report evidence consumption
more generated and less hand-copied.

