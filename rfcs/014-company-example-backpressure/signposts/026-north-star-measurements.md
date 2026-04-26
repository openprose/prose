# 026 North Star Measurements

Date: 2026-04-26
Branch: `rfc/reactive-openprose`
Commit target: `test: add north star example measurements`

## What Changed

- Upgraded `scripts/measure-examples.ts` to emit a versioned
  `measurement_version: "0.2"` report.
- Added explicit release checks for:
  - examples package compile
  - examples publish-check
  - examples strict publish-check
  - deterministic scripted Pi scenario runs
  - live Pi smoke posture
- Added per-scenario runtime telemetry placeholders for run duration, session
  count, token usage, and estimated cost.
- Regenerated:
  - `docs/measurements/latest.json`
  - `docs/measurements/latest.md`
- Strengthened `test/measure-examples.test.ts` into a schema-style contract
  test for the measurement report.

## Measurement Evidence

- examples compile: pass
- examples publish-check: pass
- examples strict publish-check: pass
- scripted Pi runs: pass
- scripted Pi sessions measured: 13
- live Pi smoke: skipped by default until Phase 06.2
- typed port coverage delta versus plain skill folder: 100%
- effect declaration delta versus plain skill folder: 100%
- brand-change sessions avoided: 2
- reactive-loop node recomputes avoided: 6
- approval gate visible to planner: yes

## Why It Matters

The north-star examples now produce a release-gate artifact instead of an
informal benchmark. The report makes package health, graph execution, eval
results, recompute savings, and live-smoke readiness visible in one durable
JSON/Markdown pair.

## Tests Run

- `bun run measure:examples`
- `bun test test/measure-examples.test.ts`
- `bun run typecheck`
- `bun test test/measure-examples.test.ts test/examples-tour.test.ts`
- `bun test`

## Tests Not Run

- Live Pi smoke; Phase 06.2 owns opt-in live inference commands and observed
  provider/model/cost results.

## Next Slice

Phase 06.2 should add the live Pi smoke ladder: cheap, medium, and complex
opt-in runs that default to Pi plus OpenRouter and write artifacts without
becoming part of the deterministic suite.

## Design Learnings

- Measurement reports should separate deterministic scripted confidence from
  live inference confidence. Both matter, but only the deterministic path should
  gate ordinary local development.
- The report needs explicit `null` cost/token fields now so live Pi telemetry
  can fill the same shape later without changing the platform contract again.
