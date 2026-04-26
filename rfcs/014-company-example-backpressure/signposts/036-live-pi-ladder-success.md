# 036 Live Pi Ladder Success

Date: 2026-04-26
Branch: `rfc/reactive-openprose`
Commit target: `test: record live pi ladder success`

## What Changed

- Added live-smoke support for writing a temporary Pi `models.json` under
  `.prose/live-pi-agent/` when OpenRouter is selected and no explicit
  `OPENPROSE_PI_AGENT_DIR` is provided.
- Kept the selected model explicit in the OpenProse runtime profile and Pi
  model registry, so the smoke can test newly available OpenRouter models
  before Pi's bundled registry catches up.
- Changed successful run acceptance diagnostics to `info` severity and hid
  informational diagnostics from the live-smoke report.
- Captured a successful full live Pi ladder using OpenRouter
  `google/gemini-3-flash-preview`:
  - cheap `company-signal-brief`: 1 Pi session
  - medium `lead-program-designer`: 3 Pi sessions
  - complex `stargazer-intake-lite`: 5 Pi sessions
- Updated release and inference docs to point at the successful ladder report.

## Why It Matters

This is the first committed evidence that the OSS package can run
actually-interesting OpenProse programs through real inference in the local
environment:

- source compiles to IR
- reactive planning selects graph nodes
- Pi creates one session per selected node
- OpenRouter supplies model inference through Pi
- `openprose_submit_outputs` materializes typed outputs
- traces and run records preserve provenance
- multi-node and approved-effect examples complete without hosted platform
  support

That is the north-star local loop in motion, not a deterministic fixture.

## Tests Run

- `OPENPROSE_LIVE_PI_SMOKE=1 OPENPROSE_PI_API_KEY="$OPENROUTER_API_KEY" OPENPROSE_LIVE_PI_MODEL_PROVIDER=openrouter OPENPROSE_LIVE_PI_MODEL_ID=google/gemini-3-flash-preview OPENPROSE_LIVE_PI_THINKING_LEVEL=off bun run smoke:live-pi -- --tier cheap --run-root .prose/live-pi-runs`
- `OPENPROSE_LIVE_PI_SMOKE=1 OPENPROSE_PI_API_KEY="$OPENROUTER_API_KEY" OPENPROSE_LIVE_PI_MODEL_PROVIDER=openrouter OPENPROSE_LIVE_PI_MODEL_ID=google/gemini-3-flash-preview OPENPROSE_LIVE_PI_THINKING_LEVEL=off bun run smoke:live-pi -- --tier medium --run-root .prose/live-pi-runs --allow-failure`
- `OPENPROSE_LIVE_PI_SMOKE=1 OPENPROSE_PI_API_KEY="$OPENROUTER_API_KEY" OPENPROSE_LIVE_PI_MODEL_PROVIDER=openrouter OPENPROSE_LIVE_PI_MODEL_ID=google/gemini-3-flash-preview OPENPROSE_LIVE_PI_THINKING_LEVEL=off bun run smoke:live-pi -- --tier complex --run-root .prose/live-pi-runs --allow-failure`
- `OPENPROSE_LIVE_PI_SMOKE=1 OPENPROSE_PI_API_KEY="$OPENROUTER_API_KEY" OPENPROSE_LIVE_PI_MODEL_PROVIDER=openrouter OPENPROSE_LIVE_PI_MODEL_ID=google/gemini-3-flash-preview OPENPROSE_LIVE_PI_THINKING_LEVEL=off bun run smoke:live-pi -- --tier all --run-root .prose/live-pi-runs`
- `bun bin/prose.ts status .prose/live-pi-runs/live-pi-cheap-company-signal-brief-20260426165207`
- `bun bin/prose.ts trace .prose/live-pi-runs/live-pi-cheap-company-signal-brief-20260426165207`
- `bun run typecheck`
- `bun test test/live-pi-smoke.test.ts test/runtime-materialization.test.ts test/run-entrypoint.test.ts test/pi-node-runner.test.ts`
- `bun run smoke:binary`
- `bun run confidence:runtime`
- `bun test`
- `git diff --check`

## Test Results

- Full live ladder: succeeded.
- Final committed report:
  [`docs/measurements/live-pi.latest.md`](../../../docs/measurements/live-pi.latest.md)
- Cheap tier: 1 Pi session, 44 trace events.
- Medium tier: 3 Pi sessions, 122 trace events.
- Complex tier: 5 Pi sessions, 186 trace events.

## Tests Not Run

- Higher-intelligence live smoke was not run. The canonical funded
  `google/gemini-3-flash-preview` ladder now covers the release-critical
  local inference path, and the expensive model pass can wait for cases that
  need deeper semantic judgment.

## Next Slice

- Commit this live evidence.
- Update the platform submodule pointer.
- Move to platform propagation planning once both branches are clean.

## Design Learnings

- OpenRouter account state and model capability are separate failure modes:
  insufficient credits, unknown Pi registry model, and model-without-tools all
  surfaced distinctly before the final successful run.
- A small generated Pi model registry is the right local-smoke affordance. It
  lets OpenProse choose a model deliberately without turning the runtime into a
  model-provider adapter.
- The live ladder now validates the OSS meta-harness shape in the way the
  deterministic suite cannot: real model calls, real Pi sessions, and real
  output-tool materialization.
