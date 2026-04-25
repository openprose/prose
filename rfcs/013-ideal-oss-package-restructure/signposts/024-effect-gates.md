# 024: Effect Gates

**Date:** 2026-04-25
**Phase:** Phase 05, sub-phase 05.4
**Commit:** same commit as this signpost

## What Changed

- Added effect approval records in the policy namespace.
- Added approval file loading for `prose run --approval approval.json`.
- Materialized local `--approved-effect` shorthand as approval records in each
  run directory.
- Made denied effect approval records override local approvals.
- Persisted `approvals.json` next to run records, plans, manifests, and traces.
- Added resumable attempt metadata when runs block on unsafe effects or
  `human_gate`.
- Kept approved effect scopes flowing into provider requests.
- Added tests for missing approval, approval-present, and denied-approval
  behavior.
- Documented the slice in `phases/05-meta-harness/effect-gates.md`.

## How To Test

- `bun test test/run-entrypoint.test.ts`
- `bunx tsc --noEmit`
- `bun test`
- Manual approval smoke:
  `bun bin/prose.ts run examples/approval-gated-release.prose.md --provider fixture --input release_candidate='v1.2.3' --output qa-check.qa_report='QA passed.' --output release-note-writer.release_summary='Release summary.' --output announce-release.delivery_receipt='Delivered to releases.' --approved-effect human_gate --approved-effect delivers`

## Results

- Targeted run entrypoint tests passed: 11 tests across 1 file.
- `bunx tsc --noEmit` passed.
- Manual approval-gated smoke passed and produced a succeeded graph run with
  `delivery_receipt`.
- `bun test` passed: 121 tests, 1 skipped live smoke across 19 files.

## Next

- Phase 05.5: add retry, cancel, and resume semantics over stored attempts and
  provider session refs.

## Risks Or Open Questions

- Local approvals are intentionally lightweight. Hosted approvals will need
  authenticated principals, expiration policy, org scope, and audit trails.
- Resume currently records a checkpoint and reason; the actual resume command
  lands in Phase 05.5.
