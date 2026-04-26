# Signpost 023: Package-Local Schema Definitions

Date: 2026-04-26
Branch: `rfc/reactive-openprose`

## Slice

Resolved the gap where named `Json<T>` ports were mostly semantic labels even
when a package declared schema resources.

## Changed

- Added package-local schema definition loading from `prose.package.json`
  `schemas`.
- Collected definitions from `$defs`, `definitions`, top-level `title`, and
  schema filenames.
- Added a small deterministic JSON Schema subset for runtime validation:
  package-local `$ref`, `type`, `required`, `properties`,
  `additionalProperties: false`, `items`, `enum`, and `const`.
- Wired named schema definitions through caller input validation and node output
  artifact validation.
- Kept unresolved named `Json<T>` contracts honest as `unchecked` with warning
  diagnostics instead of silently treating them as structurally valid.
- Updated schema validation docs and the shipped-surface snapshot.

## Tests

- `bun test test/schema-resolution.test.ts test/run-entrypoint.test.ts test/package-registry.test.ts`

## Next

Continue the hardening TODO queue. Good follow-ups are stdlib contract wording,
control/composite runtime claims, or trace telemetry richness.
