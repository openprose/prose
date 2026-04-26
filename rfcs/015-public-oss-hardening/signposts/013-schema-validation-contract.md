# 013 Schema Validation Contract

Date: 2026-04-26
Branch: `rfc/reactive-openprose`
Commit target: `feat: strengthen schema validation contract`

## Finding

Typed ports were central to the OpenProse promise, but the public package did
not clearly say which types were enforced and which were semantic labels. The
runtime also accepted some cheap-to-check invalid values, such as
`Json<number>` containing a JSON string or `integer[]` containing non-integers.

## What Changed

- Strengthened deterministic validation for primitive `Json<T>` values.
- Strengthened array validation so primitive element types are checked.
- Added run-reference validation for JSON run refs with mismatched `type`
  fields.
- Kept named domain types as semantic schema refs until schema-definition
  resolution exists.
- Added `docs/schema-validation.md` and linked it from the docs index.
- Added regression coverage in `test/schema-resolution.test.ts`.
- Marked the RFC 015 schema-validation TODO as done.

## Tests Run

- `bun test test/schema-resolution.test.ts test/run-entrypoint.test.ts test/package-registry.test.ts`
- `bun run typecheck`
- `git diff --check`

## Result

OpenProse now enforces more deterministic type failures while being clearer
about named schemas that are still metadata/search/composition contracts.

## Next Slice

Continue the public docs pass or trace telemetry review.
