# Signpost 002: Cold-Start Publishable Package Smoke

Date: 2026-04-27
Branch: `rfc/reactive-openprose`

## Summary

Added a launch cold-start gate for the publishable binary package.

The new `bun run smoke:cold-start` script:

- builds `dist/prose` and `dist/package.json`
- copies only the dist package into a temp install root
- creates a tiny `.prose.md` program in a temp workspace outside the repo
- runs the copied binary through `help`, `compile`, `plan`, `run`, `status`,
  and `trace`
- writes generated reports to `docs/measurements/cold-start.latest.*`

The runtime confidence matrix now includes this as check 19.

## Tests

Passed:

```bash
bun run smoke:cold-start
bun test test/binary-package.test.ts
bun test test/binary-package.test.ts test/docs-public.test.ts
bun run typecheck
bun run confidence:runtime
bun run smoke:binary
```

Current generated evidence:

- `bun run smoke:cold-start`: pass, 6 checks
- `bun run confidence:runtime`: pass, 19 checks, 12325ms

## Next

Proceed to launch readiness `R002`: make coding-agent onboarding a measured
surface rather than only a documentation claim.

