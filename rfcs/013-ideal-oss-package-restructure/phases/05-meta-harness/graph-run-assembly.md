# 05.6 Graph Run Assembly

This slice tightens graph records after the dependency executor, upstream
binding, effect gates, and runtime controls are in place.

## Assembly Rules

- A graph run assembles only the planner-requested outputs.
- `--target-output summary` can produce a valid graph run with only `summary`;
  other graph outputs do not block the run.
- Skipped nodes are recorded in graph trace metadata, but they are not
  materialized as new node records.
- Failed node records remain queryable and update `latest` / `failed` pointers,
  but they do not become `current`.
- Successful accepted nodes update `current`.
- Blocked nodes update `pending`.

## Why This Matters

Reactive systems need partial recompute. Without targeted graph assembly,
OpenProse would execute selectively but then fail graph materialization because
unrequested outputs were absent. This slice aligns the run record with the
planner's materialization set.

## Tested Scenarios

- A selective graph run requesting only `summary` succeeds and materializes only
  `summarize`.
- A failed retry source run records the failed node as latest/failed, while
  leaving current null.
- Existing retry tests then show the retry only executes the failed node and
  returns the graph to success.

## Remaining Work

- Provider cost and duration telemetry should be aggregated into graph-level
  trace summaries after providers expose richer structured telemetry.
- Rejected eval acceptance will be tightened in Phase 06 when eval execution is
  real.
