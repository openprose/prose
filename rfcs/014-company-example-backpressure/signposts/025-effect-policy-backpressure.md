# 025 Effect Policy Backpressure

Date: 2026-04-26
Branch: `rfc/reactive-openprose`
Commit target: `test: harden example effect policy`

## What Changed

- Added approval provenance to runtime traces:
  - blocked pre-session traces
  - single-provider run traces
  - graph run traces
- Added a prompt-envelope test proving approved effects are included for the
  gated `announce-release` node in `release-proposal-dry-run`.
- Added a release dry-run regression proving output submission fails when a
  node reports a performed effect it did not declare, even if the caller
  approved that effect globally.
- Updated hosted runtime contract fixtures because `trace.json` now includes
  approval record metadata.

## Policy Backpressure Proven

- Missing approvals still block before any Pi session launches.
- Approved effects are visible to the Pi session through the persisted node
  envelope and rendered prompt context.
- Performed effects are checked against the component declaration after
  structured output submission.
- Trace artifacts now carry the approval record summaries needed for hosted
  runtime audit and replay.

## Why It Matters

Phase 05 is about making unsafe work observable and controlled, not merely
well-prompted. This slice tightens both sides of that boundary: the model can
see what has been approved, and the runtime still rejects undeclared behavior
after the model submits outputs.

## Tests Run

- `bun test test/release-proposal-dry-run-example.test.ts test/node-prompt-envelope.test.ts test/run-entrypoint.test.ts test/output-submission.test.ts test/runtime-control.test.ts`
- `bun run typecheck`
- `bun test test/hosted-contract-fixtures.test.ts`
- `bun test`

## Tests Not Run

- `bun run measure:examples`; no example source or measurement metadata changed
  in this slice.

## Next Slice

Phase 06.1 should refresh measurement reports and release-gate documentation so
the example ladder clearly shows what improved after the gated/mutating
workflow work.

## Design Learnings

- Approval records belong in traces, not only run records. Hosted and local
  consumers need a single trace artifact that explains why a gated run was able
  to proceed.
- Global approvals are intentionally insufficient for undeclared behavior.
  Declaration remains the component-level contract; approval only authorizes
  declared effects in the selected materialization set.
