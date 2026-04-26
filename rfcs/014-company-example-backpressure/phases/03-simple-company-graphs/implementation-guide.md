# Phase 03 Implementation Guide

Phase 03 proves the smallest useful React-like graph.

## 03.1 `company-signal-brief`

Implementation:

- Add one pure component.
- Execute through the new single-run path or a one-node Pi graph VM path.
- Use it for cheap live smoke only; do not let it dominate architecture.

Tests:

- Compile.
- Scripted Pi session.
- Eval acceptance.
- Optional live Pi smoke.

Commit/signpost:

- `feat: add company signal brief example`
- `signposts/017-company-signal-brief.md`

## 03.2 `lead-program-designer`

Implementation:

- Add graph nodes:
  - `profile-normalizer`
  - `qualification-scorer`
  - `save-grow-program-drafter`
- Use typed upstream artifacts as Pi node prompt inputs.
- Record session count and run reuse.

Tests:

- First run creates three sessions.
- Brand change re-runs only drafter.
- Profile change re-runs scorer and drafter.
- Generic draft seeded-bad case fails eval.

Commit/signpost:

- `feat: add lead program designer example`
- `signposts/018-lead-program-designer.md`

## 03.3 Simple Example Measurements

Implementation:

- Extend measurements with executed/reused nodes, session count, eval status,
  duration, and model provider/model when present.

Tests:

- Run measurement script.
- Validate generated JSON schema.
- Run `bun run typecheck`.

Commit/signpost:

- `test: measure simple company examples`
- `signposts/019-simple-example-measurements.md`
