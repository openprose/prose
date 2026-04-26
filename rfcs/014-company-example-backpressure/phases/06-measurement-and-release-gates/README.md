# Phase 06: Measurement And Release Gates

Goal: make the examples part of release confidence rather than optional demos.

## 06.1 Add North-Star Measurement Script

Build:

- Add or extend a measurement script that reports:
  - example compile status
  - publish-check status
  - scripted Pi run status
  - live Pi smoke status when enabled
  - node counts
  - session counts
  - cost/duration telemetry when available
  - eval pass/fail
  - selective recompute savings

Tests:

- Run the measurement script.
- Add a unit test that verifies the JSON schema of the generated report.
- Run `bun run typecheck`.

Commit:

- Commit as `test: add north star example measurements`.

Signpost:

- Add `signposts/021-north-star-measurements.md`.

## 06.2 Add Live Pi Smoke Ladder

Build:

- Add opt-in scripts/docs for:
  - cheap live smoke: `company-signal-brief`
  - medium live graph: `lead-program-designer`
  - complex live graph: one of `stargazer-intake-lite` or
    `agent-ecosystem-index-refresh`
- Default to OpenRouter + cheap model for smoke, but allow stronger models for
  quality runs.

Tests:

- Live tests are opt-in and skipped by default.
- When env vars are present, smoke writes run artifacts and measurement report.
- Failure surfaces model/provider/auth errors distinctly.
- Run `bun run typecheck`.
- Run full deterministic suite.

Commit:

- Commit as `test: add live pi smoke ladder`.

Signpost:

- Add `signposts/022-live-pi-smoke-ladder.md` with exact commands and observed
  model/cost posture.

## 06.3 Add Confidence Matrix Integration

Build:

- Add deterministic north-star example checks to `confidence:runtime`.
- Keep live Pi checks separate and opt-in.
- Ensure binary smoke still passes.

Tests:

- Run `bun run confidence:runtime`.
- Run `bun run smoke:binary`.
- Run `bun run typecheck`.
- Run `bun test`.

Commit:

- Commit as `test: gate runtime confidence on north star examples`.

Signpost:

- Add `signposts/023-confidence-matrix-integration.md`.

## 06.4 Update Docs And Diagrams

Build:

- Update examples README, inference docs, diagrams, and release-candidate docs.
- Explain why these examples are backpressure for the Pi-backed meta-harness.
- Remove public-facing references to outdated `provider` concepts as they are
  replaced.

Tests:

- Run docs link/file existence checks if available.
- Run `bun run prose publish-check examples --strict`.
- Run `bun run typecheck`.

Commit:

- Commit as `docs: document north star example suite`.

Signpost:

- Add `signposts/024-docs-and-diagrams.md`.
