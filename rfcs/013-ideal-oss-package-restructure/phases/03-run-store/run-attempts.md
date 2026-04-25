# Run Attempts Slice

**Date:** 2026-04-25
**Phase:** 03.4 Record Attempts, Failures, Retries, And Resume Points

The local store now records immutable run attempts separately from run records
and graph node pointers.

## Attempt Shape

`LocalRunAttemptRecord` contains:

- run id
- component ref
- attempt number and attempt id
- lifecycle status
- provider session reference
- started and finished timestamps
- diagnostics
- failure detail
- retry policy detail
- resume checkpoint detail

Attempts are stored under:

```text
.prose/runs/<run-id>/attempts/attempt-<n>.json
```

And indexed by run id under:

```text
.prose/indexes/attempts/by-run/<run-id>.json
```

## Pointer Safety

Failed or cancelled attempts can become `latest` or `failed` on a graph node
pointer, but they do not replace `current_run_id`. Only an accepted successful
run becomes current.

## Status Integration

Store-root status now includes attempt counts and latest attempt status for runs
with attempt records.

## Current Gaps

- Attempts are written through explicit store APIs. The fixture provider and
  future meta-harness will call these APIs automatically in later phases.
- Retry scheduling is recorded, not executed.
- Resume checkpoints are referenced, not interpreted.
