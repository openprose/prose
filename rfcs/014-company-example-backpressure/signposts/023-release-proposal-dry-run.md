# 023 Release Proposal Dry Run

Date: 2026-04-26
Branch: `rfc/reactive-openprose`
Commit target: `feat: add release proposal dry run example`

## What Changed

- Added a pure `release-decision-check` node ahead of the gated release path.
- Added `release_decision` as a graph output so callers can target a no-op
  release decision without selecting the gated delivery branch.
- Kept release delivery guarded by `human_gate` and `delivers` effects on
  `announce-release`.
- Added a `low-coverage.release-candidate.json` fixture.
- Added `test/release-proposal-dry-run-example.test.ts` covering:
  - release-needed path blocks before Pi starts without approval
  - release-needed path proceeds with approval and passes eval
  - no-op release targets only `release_decision` and returns `not_required`
  - fabricated commit ranges are rejected by the required eval
  - low changelog/test coverage is rejected by the required eval
- Updated existing runtime fixtures, north-star scripted scenarios, example
  docs, package IR, and measurement docs for the new decision node.

## Approval Behavior

- Without approval:
  - no Pi session launches
  - graph status is `blocked`
  - trace renders `gate[effect_approval]`
- With `human_gate` and `delivers` approval:
  - `release-decision-check`, `qa-check`, `release-note-writer`, and
    `announce-release` all materialize
  - `announce-release` receives approved effects in its provider request
  - required eval can accept the release run
- No-op path:
  - `targetOutputs = ["release_decision"]`
  - only `release-decision-check` runs
  - no approval is required because the effecting branch is not selected

## Why It Matters

This slice proves that OpenProse can model effectful workflows without forcing
every read-only decision through the effect gate. The graph can expose a pure
decision outcome for no-op cases while still making the delivery path impossible
to run without explicit approval.

## Tests Run

- `bun test test/release-proposal-dry-run-example.test.ts test/north-star-scripted-scenarios.test.ts test/examples-tour.test.ts test/run-entrypoint.test.ts test/runtime-materialization.test.ts test/runtime-control.test.ts`
- `bun run prose compile examples --no-pretty`
- `bun run prose publish-check examples --strict`
- `bun test test/package-ir.test.ts test/release-proposal-dry-run-example.test.ts test/examples-tour.test.ts test/north-star-scripted-scenarios.test.ts`
- `bun run measure:examples`
- `bun test test/measure-examples.test.ts`
- `bun run typecheck`
- `bun test`

## Tests Not Run

- none

## Next Slice

Phase 05.2 should harden `customer-repo-scaffold-preview` around scratch
workspace mutation: expected directories, overwrite refusal, seeded old
`delivery/` path failure, eval compilation, and local package checks where
feasible.

## Design Learnings

- Targeted graph outputs are the right mechanism for "no-op skips gate." We do
  not need dynamic effect declarations for this case; the selected materialized
  branch determines whether an unsafe effect can execute.
- Approval policy stays pre-session. The blocked release-needed run proves the
  runtime can reject effecting work before opening even the first Pi session.
