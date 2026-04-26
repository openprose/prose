# 08.3 Run Workflow Suite

## Build

- Trigger acceptance workflows:
  - company map
  - intelligence daily dry-run
  - GTM pipeline through approval continuation
  - stargazer daily fixture/idempotence path
- Capture run ids, graph ids, artifacts, approvals, eval summaries, and pointer
  updates.

## Tests

- Every workflow reaches expected status.
- Human-gated workflow blocks before approval and continues after approval.
- Dry-run effects do not perform real external writes.
- Current pointers update only on accepted success.
- Re-run proves at least one current/reuse path.

## Commit

Commit smoke/test updates as `test: run native company workflow suite`.

## Signpost

Record workflow evidence and any unresolved runtime issues.

