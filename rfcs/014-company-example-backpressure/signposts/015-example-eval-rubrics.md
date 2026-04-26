# 015 Example Eval Rubrics

Date: 2026-04-26
Branch: `rfc/reactive-openprose`
Commit target: `test: add north star eval rubrics`

## What Changed

- Added one eval rubric per north-star example under
  `examples/evals/north-star/`.
- Linked the rubrics from `examples/prose.package.json`, bringing the examples
  package to 9 advertised eval contracts:
  - the existing `examples-quality` package eval
  - 8 north-star example rubrics
- Each north-star eval declares:
  - `subject: Json<RunSubject>`
  - `fixture_root: string`
  - `verdict: Json<EvalVerdict>`
  - `pure` effects
  - `### Expects`
  - `### Expects Not`
  - `### Metrics`
- Added `test/north-star-evals.test.ts` to verify every rubric is linked,
  compiles, and contains the required rubric sections.
- Regenerated package IR and runtime confidence reports.

## Testing

- `bun run prose compile examples --no-pretty`
- `bun run prose publish-check examples --strict`
- `bun test test/north-star-evals.test.ts test/examples-tour.test.ts test/package-ir.test.ts test/eval-execution.test.ts`
- `bun run typecheck`
- `bun run confidence:runtime`

Result: all checks pass. Runtime confidence remains green with 15 checks.

## Notable Learning

The eval rubrics are now package-visible without needing a separate metadata
format. That keeps the direction coherent: OpenProse examples are not just
programs, they are programs plus declared backpressure about what good
materialized outcomes must prove.

## Next Slice

Phase 01.4 should enrich scripted Pi scenarios so the north-star fixtures and
rubrics can drive deterministic graph runs through `openprose_submit_outputs`.
