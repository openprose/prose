# 022 Reactive Loop Measurements

Date: 2026-04-26
Branch: `rfc/reactive-openprose`
Commit target: `test: measure reactive company loops`

## What Changed

- Extended `scripts/measure-examples.ts` to run the Phase 04 reactive company
  loops, not just the simple Phase 03 examples.
- Added measurement fields for:
  - memory artifact count
  - duplicate suppression count
  - high-water mark result
  - targeted recompute saved nodes
  - stale reason summaries
- Regenerated:
  - `docs/measurements/latest.json`
  - `docs/measurements/latest.md`
- Updated `test/measure-examples.test.ts` to lock the new reactive loop
  measurement expectations.

## Measurement Evidence

- `stargazer_intake_lite`
  - graph nodes: 5
  - scripted Pi sessions: 5
  - memory artifacts: 1
  - skipped rows: 2
  - duplicate suppressions: 1
  - high-water mark: `2026-04-26T08:15:00Z`
  - replay status: `current`
  - replay saved nodes: 5
- `opportunity_discovery_lite`
  - graph nodes: 4
  - scripted Pi sessions: 4
  - stale rows rejected: 1
  - missing-provenance rows rejected: 1
  - duplicate suppressions: 1
  - winning source: `https://x.example/status/1003`
  - brand-change reused nodes: `platform-scan-reader`
  - brand-change saved nodes: 1
- Baseline comparison now reports:
  - reactive-loop node recomputes avoided: 6
  - duplicate suppressions measured: 2

## Why It Matters

The docs now show concrete runtime advantages for the React-like agent outcome
model: accepted state can be replayed without duplicate work, source windows can
be reused across downstream reasoning changes, and the system can count the
duplicative work it avoided.

## Tests Run

- `bun run measure:examples`
- `bun test test/measure-examples.test.ts`
- `bun run typecheck`
- `bun test`

## Tests Not Run

- none

## Next Slice

Phase 04 is complete. Move to the next RFC 014 phase and start with its README
and implementation guide before editing, then keep the same test/signpost/commit
loop for each slice.

## Design Learnings

- Measurement is strongest when it is produced from real run records and graph
  outputs, not hand-maintained documentation. The script now parses the same
  artifacts an operator would inspect.
- Stale reasons are useful product language. `input_hash_changed` and
  `upstream_stale` already explain why a graph rerendered, and should keep
  informing CLI/UI design.
