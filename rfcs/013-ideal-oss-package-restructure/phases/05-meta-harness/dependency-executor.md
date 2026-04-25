# 05.2 Dependency Executor

This slice turns `prose run` from a single-contract runner into the first real
local meta-harness. The runner now compiles source, plans the reactive graph,
then executes selected provider-backed components in planner order.

## Runtime Rules

- A graph run requires a `program` component plus one or more executable child
  components.
- The planner remains the authority for node selection and ordering.
- `current` nodes are copied into the new run directory and are not executed.
- `skipped` nodes are omitted from this run.
- `ready` nodes are executed through the selected runtime provider.
- `blocked_input` and `blocked_effect` nodes materialize blocked node records.
- If an upstream node fails or blocks at runtime, downstream nodes materialize
  blocked records instead of calling the provider.
- The graph run is assembled after node execution:
  - `succeeded` when all required graph outputs can be read from successful
    nodes.
  - `failed` when any executed node failed.
  - `blocked` when no node failed but at least one required node/output is not
    available.

## Run Records

- Graph run id: the requested run id.
- Node run id: `{graph_run_id}:{component_name}`.
- Node records are written to `nodes/{component_id}.run.json`.
- Graph outputs are copied from node artifacts to `bindings/$graph/{port}.md`.
- The local store receives graph and node run index entries, attempts, output
  artifacts, caller input artifacts, and graph-node pointers.
- Downstream node input records store upstream output hashes and source run ids
  when the upstream output has already materialized. This keeps `current` reuse
  honest even before full artifact propagation lands in 05.3.

## Current Scope

This slice deliberately does not yet pass upstream artifact content into
downstream provider requests. Providers receive direct caller inputs and null
upstream bindings for now. Phase 05.3 will promote upstream artifact binding
into the provider request itself.

## Manual Smoke

```sh
bun bin/prose.ts run fixtures/compiler/pipeline.prose.md \
  --provider fixture \
  --run-root /tmp/openprose-graph-smoke \
  --run-id graph-smoke \
  --input draft='Smoke draft.' \
  --output review.feedback='Needs less fog.' \
  --output fact-check.claims='Claims verified.' \
  --output polish.final='Polished smoke draft.' \
  --no-pretty
```

Expected summary:

```json
{"run_id":"graph-smoke","status":"succeeded","outputs":["final"]}
```
