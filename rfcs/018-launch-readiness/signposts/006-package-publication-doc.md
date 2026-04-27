# Signpost 006: Package Publication Story

Date: 2026-04-27
Branch: `rfc/reactive-openprose`

## Summary

Documented the public package boundary.

Added `docs/package-publication.md`, which explains:

- the root package is a private source workspace
- `dist/` is the generated publishable CLI artifact
- `dist/package.json` owns the package-manager `bin`
- `smoke:binary`, `smoke:cold-start`, and `test/binary-package.test.ts` guard
  the publication story

## Tests

Passed:

```bash
bun run smoke:cold-start
bun test test/binary-package.test.ts test/docs-public.test.ts
git diff --check
```

## Next

Proceed to launch readiness `R006`: keep hosted contract drift visible between
the OSS remote envelope fixtures and the platform runtime.

