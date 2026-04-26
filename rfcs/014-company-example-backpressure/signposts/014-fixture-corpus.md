# 014 Fixture Corpus

Date: 2026-04-26
Branch: `rfc/reactive-openprose`
Commit target: `test: add north star fixture corpus`

## What Changed

- Added hand-readable fixtures under `examples/north-star/fixtures/`.
- Standardized the fixture naming convention:

```text
examples/north-star/fixtures/<example>/<scenario>.<input>.(json|md)
```

- Covered every north-star example with at least one input fixture.
- Added pressure cases called out in Phase 01.2:
  - lead profile and brand context
  - stargazer duplicate/high-water edges
  - platform opportunity duplicate cross-posts
  - release-needed and no-op release candidates
  - customer repo scaffold profile/program inputs
  - agent ecosystem seed/policy inputs
  - merged PR batch and prior review memory
  - seeded-bad fixtures for eval and runtime backpressure
- Added `test/north-star-fixtures.test.ts` so fixture quality is mechanical:
  - JSON fixtures must parse.
  - Markdown fixtures must be non-empty heading-led documents.
  - fixture directories must map to manifest examples.
  - fixture input slugs must map to declared program/service inputs.
  - corpus scenarios must include happy, stale, duplicate, gated/no-op, and
    seeded-bad pressure.

## Testing

- `bun test test/north-star-fixtures.test.ts`
- `bun run prose package examples --format json`
- `bun run prose publish-check examples --strict`

Result so far: all focused checks pass.

## Notable Learning

The filename convention gives us useful backpressure without adding bespoke
metadata files. A fixture like
`lead-program-designer/stale.brand-context.md` is both readable to humans and
machine-checkable against the `brand_context` input on
`lead-program-designer`.

## Next Slice

Phase 01.3 should define eval rubrics for each north-star example. The fixtures
added here should become the raw material for deterministic eval assertions and
seeded-bad failure cases.
