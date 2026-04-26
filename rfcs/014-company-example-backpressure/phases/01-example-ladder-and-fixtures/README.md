# Phase 01: Example Ladder And Fixtures

Goal: turn the company-repo inspiration into a concrete, small, durable example
ladder with fixtures that can pressure the runtime before live model calls are
involved.

## 01.1 Freeze The Example Ladder

Build:

- Confirm the example names and order from `examples.md`.
- Decide which examples live under `examples/company/` versus a new
  `examples/north-star/` package.
- Add a short README explaining that these examples are runtime backpressure,
  not general docs snippets.

Tests:

- Run `bun run prose package examples --format json`.
- Run `bun run prose publish-check examples --strict`.
- Run `bun run typecheck`.

Commit:

- Commit as `docs: define company example ladder`.

Signpost:

- Add `signposts/013-example-package-placement.md` with the final example list and any
  renamed examples.

## 01.2 Create Fixture Corpus

Build:

- Add fixture inputs for:
  - lead profile and brand context
  - GitHub stargazer batch with duplicates and high-water mark edges
  - platform opportunity scan results with duplicate cross-posts
  - release commit/change summary with no-op and release-needed cases
  - scaffold profile/program pair
  - merged PR batch and prior review memory
- Keep fixtures small, readable, and hand-editable.
- Include seeded-bad fixtures beside the happy fixtures.

Tests:

- Add a test that every fixture parses as JSON or Markdown as declared.
- Add a test that fixture filenames map to an example and scenario.
- Run `bun test test/north-star-fixtures.test.ts` once added.
- Run `bun run typecheck`.

Commit:

- Commit as `test: add north star example fixtures`.

Signpost:

- Add `signposts/014-fixture-corpus.md` with fixture coverage and known gaps.

## 01.3 Define Example Quality Rubrics

Build:

- Add lightweight eval contracts for each planned example before the examples
  themselves are fully implemented.
- Each eval should include `### Expects`, `### Expects Not`, and performance
  metrics.
- Start with semantic assertions that can run over deterministic outputs.

Tests:

- Run `bun run prose compile examples --no-pretty`.
- Run `bun run prose publish-check examples --strict`.
- Add compile tests for every eval file.

Commit:

- Commit as `test: add north star example eval contracts`.

Signpost:

- Add `signposts/015-example-eval-rubrics.md` with which evals are executable
  and which are placeholders.

## 01.4 Add Scripted Pi Session Test Double

Build:

- Create a test-only scripted Pi session helper that satisfies the Pi
  `AgentSession` shape OpenProse uses.
- The helper should emit realistic Pi lifecycle events and write/submit
  declared artifacts.
- Keep it out of public CLI/runtime docs. This is a test double, not a runtime
  provider.

Tests:

- Add unit tests for lifecycle events, output materialization, timeout, abort,
  and model error simulation.
- Run focused Pi harness tests.
- Run `bun run typecheck`.

Commit:

- Commit as `test: add scripted pi session helper`.

Signpost:

- Add `signposts/016-scripted-pi-scenarios.md` explaining how deterministic
  runtime tests avoid a public fake runtime.
