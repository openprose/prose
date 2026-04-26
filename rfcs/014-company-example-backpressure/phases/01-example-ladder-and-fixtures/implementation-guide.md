# Phase 01 Implementation Guide

Phase 01 should run after the Phase 02 runtime boundary is corrected.

## 01.1 Example Package Placement

Implementation:

- Create `examples/north-star/` as the canonical example package.
- Keep the old examples only if they are rewritten to the new runtime language;
  otherwise delete them.
- Add a README that explains these are runtime backpressure examples.

Tests:

- Compile the package.
- Strict publish-check the package.
- Run `bun run typecheck`.

Commit/signpost:

- `docs: define north star example package`
- `signposts/013-example-package-placement.md`

## 01.2 Fixture Corpus

Implementation:

- Add small JSON/Markdown inputs for each example.
- Add happy, stale, duplicate, gated, and seeded-bad cases.
- Keep fixtures hand-readable.

Tests:

- Fixture parse test.
- Fixture filename-to-example mapping test.
- Run `bun test test/north-star-fixtures.test.ts`.
- Run `bun run typecheck`.

Commit/signpost:

- `test: add north star fixture corpus`
- `signposts/014-fixture-corpus.md`

## 01.3 Eval Rubrics

Implementation:

- Add eval contracts before full examples.
- Each eval must include `Expects`, `Expects Not`, and measurable failure
  examples.

Tests:

- Compile eval files.
- Run publish-check.
- Run focused eval compile tests.

Commit/signpost:

- `test: add north star eval rubrics`
- `signposts/015-example-eval-rubrics.md`

## 01.4 Scripted Pi Scenarios

Implementation:

- Add scripted session scenarios per example and failure case.
- Scenarios should exercise `openprose_submit_outputs`, not output files.

Tests:

- Scripted success/failure scenarios.
- Runtime trace includes synthetic Pi events.
- Run `bun run typecheck`.

Commit/signpost:

- `test: add scripted pi example scenarios`
- `signposts/016-scripted-pi-scenarios.md`
