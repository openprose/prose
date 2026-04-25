# 05.5 Runtime Control

This slice adds local control primitives for retrying, cancelling, and resuming
runs. These are API-level controls first; hosted scheduling and operator UI can
layer on the same semantics later.

## Retry

`retryRunFile` and `retryRunSource` run the same source with a required
`currentRunPath` and default trigger `graph_recompute`.

Because the planner already treats failed node records as stale, retrying a
graph reuses current successful nodes and only calls providers for stale or
failed nodes.

## Resume

`resumeRunFile` and `resumeRunSource` run the same source with a required
`currentRunPath` and default trigger `human_gate`.

This is intentionally thin: resume is not a separate execution engine. It is a
new run over the same reactive planner, usually with approval records added.

## Cancel

`cancelRunPath(runDir)` writes a new cancelled attempt for the run and updates
the local run index status to `cancelled`.

The original run record remains immutable and inspectable. The cancellation is
stored as:

- a run attempt with status `cancelled`
- a run index update
- `controls/cancel-{attempt}.json` in the run directory

## Testing Shape

- Retry is tested by failing one node in a graph, then retrying from the failed
  run directory and asserting only that stale node executes.
- Cancel is tested by cancelling a blocked human-gated run and checking attempt
  lineage.
- Resume is tested by resuming a blocked human-gated run with approvals and
  asserting the resumed graph succeeds.

## Intentional Limits

- There is not yet a CLI command for retry/cancel/resume. That should be added
  after the API shape settles.
- Cancel does not interrupt a live provider session yet; it records cancellation
  intent and lineage for local runs.
- Provider-specific resume is still delegated to provider session refs. Phase
  05.6 and later provider work can make that more concrete.
