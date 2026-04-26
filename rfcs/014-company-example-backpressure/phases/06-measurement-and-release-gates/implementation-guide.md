# Phase 06 Implementation Guide

Phase 06 turns examples into release gates.

## 06.1 Measurement Script

Implementation:

- Add a north-star measurement report with compile status, eval status,
  executed/reused nodes, session count, cost/duration, and recompute savings.

Tests:

- Run measurement script.
- Validate JSON schema.
- Run `bun run typecheck`.

Commit/signpost:

- `test: add north star measurements`
- `signposts/026-north-star-measurements.md`

## 06.2 Live Pi Smoke Ladder

Implementation:

- Add opt-in commands for cheap, medium, and complex live Pi smokes.
- Default to Pi + OpenRouter model-provider config.
- Keep failures classified by auth/model/provider/runtime.

Tests:

- Skips by default.
- Runs when env vars are present.
- Writes artifacts and measurement report.

Commit/signpost:

- `test: add live pi smoke ladder`
- `signposts/027-live-pi-smoke-ladder.md`

## 06.3 Confidence Matrix

Implementation:

- Add deterministic north-star checks to confidence matrix.
- Keep live checks opt-in.
- Remove old fixture-provider confidence steps.

Tests:

- `bun run confidence:runtime`
- `bun run smoke:binary`
- `bun run typecheck`
- `bun test`

Commit/signpost:

- `test: gate confidence on north star examples`
- `signposts/028-confidence-matrix-integration.md`

## 06.4 Docs And Diagrams

Implementation:

- Update docs to explain Pi-backed graph VM, model providers, node sessions,
  output tool, and reactive example ladder.
- Remove old provider docs.

Tests:

- Docs link/file existence checks if available.
- Publish-check examples.
- Run `bun run typecheck`.

Commit/signpost:

- `docs: document pi-backed north star examples`
- `signposts/029-docs-and-diagrams.md`
