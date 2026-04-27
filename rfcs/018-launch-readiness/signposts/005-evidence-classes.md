# Signpost 005: Evidence Classes

Date: 2026-04-27
Branch: `rfc/reactive-openprose`

## Summary

Added a public evidence-classes page so launch claims do not blur deterministic
local confidence, live model inference, and hosted dev interop.

Added:

- `docs/evidence-classes.md`
- links from `docs/README.md`, `docs/measurement.md`, and
  `docs/release-candidate.md`

## Tests

Passed:

```bash
bun test test/docs-public.test.ts
git diff --check
```

## Next

Proceed to launch readiness `R005`: make the package publication story one
step more explicit around the generated dist package and smoke commands.

