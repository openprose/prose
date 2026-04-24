# 028: Local Measurement Surface

## What shipped

This wave added the first reproducible measurement harness for modern
OpenProse:

- `scripts/measure-examples.ts`
- `bun run measure:examples`
- generated reports in `docs/measurements/latest.json` and `latest.md`
- a new `docs/measurement.md` guide explaining what is measured and why

## What it measures

The current harness measures:

- package quality across `examples`, `packages/std`, `packages/co`, and the
  local reference company when present
- strict publish readiness
- selective recompute savings for a targeted output
- blocked-effect visibility for approval-gated flows
- basic compile/plan latency over the curated examples

## What we learned immediately

The first report is already useful:

- `examples` now passes strict publish checks
- `co` passes strict publish checks
- the reference company passes strict publish checks
- `std` still lags on typed ports and declared effects, which is now easy to
  quantify instead of hand-wave
- selective recompute avoids both one node re-run and one graph rewrite in the
  current example harness

## Why it matters

One of the original design goals was to make agent software measurable rather
than mystical. This is the first local proof of that direction: the repo can
now tell us where the discipline is working and where it still needs to catch up.
