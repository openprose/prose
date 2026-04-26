# 027 Live Pi Smoke Ladder

Date: 2026-04-26
Branch: `rfc/reactive-openprose`
Commit target: `test: add live pi smoke ladder`

## What Changed

- Added `bun run smoke:live-pi`.
- Added `scripts/live-pi-smoke.ts` with opt-in tiers:
  - `cheap`: `company-signal-brief`
  - `medium`: `lead-program-designer`
  - `complex`: `stargazer-intake-lite`
  - `all`: all tiers in order
- Added default skipped live-smoke reports:
  - `docs/measurements/live-pi.latest.json`
  - `docs/measurements/live-pi.latest.md`
- Added docs for live Pi smoke usage in:
  - `docs/inference-examples.md`
  - `docs/measurement.md`
- Updated `measure:examples` so the main measurement report points at the live
  smoke command.
- Added `test/live-pi-smoke.test.ts` covering:
  - default skip behavior
  - report file generation
  - missing-auth classification before Pi sessions launch

## Live Attempt

Command shape:

```bash
OPENPROSE_LIVE_PI_SMOKE=1 \
OPENPROSE_PI_API_KEY="$OPENROUTER_API_KEY" \
bun run smoke:live-pi -- --tier cheap --run-root /tmp/openprose-live-pi/runs --out /tmp/openprose-live-pi/live-pi.latest.json --allow-failure
```

Observed result:

- model provider: `openrouter`
- model: `google/gemini-3-flash-preview`
- tier: `cheap`
- scenario: `company-signal-brief`
- status: `failed`
- failure class: `billing_or_quota`
- Pi sessions observed: 1
- trace events observed: 12
- provider diagnostic: OpenRouter returned 402 insufficient credits
- cost: no successful usage/cost telemetry was available because the provider
  rejected the request before completion

## Why It Matters

Live inference remains outside the deterministic suite, but it is no longer an
ad hoc command pasted into a terminal. The ladder gives us a repeatable way to
exercise the real Pi SDK boundary from small to graph-shaped examples, while
classifying auth, billing, model, provider, timeout, policy, and runtime
contract failures.

## Tests Run

- `bun run smoke:live-pi -- --tier cheap --skip --run-root .prose/live-pi-runs`
- `bun test test/live-pi-smoke.test.ts test/measure-examples.test.ts`
- `bun test test/live-pi-smoke.test.ts test/measure-examples.test.ts test/pi-provider.test.ts`
- `bun run typecheck`
- `bun run measure:examples`
- `bun test`
- Opt-in live attempt with OpenRouter key, recorded above

## Tests Not Run

- Successful live Pi smoke; the available OpenRouter key returned a 402
  credits/billing error.
- `medium`, `complex`, and `all` live tiers with paid inference; blocked on the
  same provider billing posture.

## Next Slice

Phase 06.3 should wire deterministic north-star checks into
`confidence:runtime`, keep `smoke:live-pi` opt-in, and verify the Bun binary
still passes smoke.

## Design Learnings

- Live smoke run IDs need timestamps because run records are intentionally
  immutable. Reusing a live run root should not fail because a prior smoke left
  durable artifacts behind.
- Billing/quota deserves its own failure class. It is neither a model-quality
  issue nor an OpenProse runtime issue, and operators need that distinction
  immediately.
