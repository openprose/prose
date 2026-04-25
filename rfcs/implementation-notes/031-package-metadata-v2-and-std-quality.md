# Implementation Note 031: Package Metadata V2 And Std Quality

**RFC:** 012 Hosted Runtime Contract And Artifact Semantics

**Date:** 2026-04-25

**Status:** implemented for hosted-ingest metadata and standard-library strict
publish readiness

## Summary

`prose package` now emits a hosted-ingest metadata contract:

- `schema_version: openprose.package.v2`
- `package_version: 0.2`
- deterministic `metadata_digest`
- `hosted_ingest` projection for platform registries

The hosted projection duplicates only the fields a registry needs to ingest a
version immutably: package identity, source identity, component catalog, ports,
effects, examples, evals, and quality signals. Visibility, organization
ownership, and publish permissions remain host-owned overlays.

## Standard Library Ratchet

The standard library was updated to match the new source conventions:

- actual `Requires` and `Ensures` ports use explicit type names
- every published component declares effects
- delivery, memory, research, and ops components use non-pure effect labels
  where appropriate
- parser behavior now ignores narrative bullets in `Requires`/`Ensures` instead
  of treating them as malformed ports unless the item is clearly an attempted
  port declaration

`packages/std` now passes strict publish readiness.

## Tests

```bash
cd /Users/sl/code/openprose/platform/external/prose
bun test
bunx tsc --noEmit
bun bin/prose.ts package packages/std --strict --format json
bun bin/prose.ts publish-check packages/std --strict --format json
```

Observed result:

- full OSS test suite: passed, 69 tests
- typecheck: passed
- `packages/std` metadata: `schema_version=openprose.package.v2`,
  `package_version=0.2`, 64-character metadata digest
- `packages/std` strict publish-check: passed
- std quality: typed-port coverage 1, effect declaration ratio 1, eval link
  ratio 1, example link ratio 1, no strict quality warnings

## Platform Backpressure

Workstream 03 should accept `openprose.package.v2` directly and store the
metadata digest. The platform may keep storing the full manifest JSON, but new
registry code should prefer `hosted_ingest` for package/component extraction
instead of reconstructing a platform-specific catalog from older metadata
fields.

## Remaining Quality Notes

`packages/std` still has non-blocking diagnostics around package-scope service
resolution and canonical section order in some older files. These are not
strict publish blockers, but they are useful future source-quality cleanup.
