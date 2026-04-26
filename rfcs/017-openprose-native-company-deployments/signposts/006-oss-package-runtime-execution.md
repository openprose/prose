# 006: OSS Package Runtime Execution

Date: 2026-04-26

## Slice

Phase 03 now executes local deployment triggers through real OpenProse run
materialization instead of recording plan-only deployment runs.

## What Changed

- Added IR-native runtime entry points:
  - `planIr(ir, options)` backs `planSource`.
  - `runIr(ir, options)` backs `runSource`.
- Added a package-entrypoint runtime IR projection for deployments.
  - Package service execution edges become runtime dependency edges.
  - Requested entrypoint outputs get explicit return edges.
  - Entrypoint inputs remain caller-provided.
  - Non-entrypoint required ports that are owned by package call wiring are
    treated as internally resolved for local deployment execution.
- Local deployment triggers now:
  - compile the package,
  - plan the selected entrypoint,
  - project it into executable runtime IR,
  - run it through the scripted Pi-shaped runtime,
  - persist immutable OpenProse run records under `runtime-runs/`,
  - persist artifact/run indexes under `runtime-store/`,
  - record `openprose_run_ref`, `openprose_plan_ref`, node-run counts, and
    output counts on the deployment run record.
- Local deployment dry-run environment bindings are made visible to node
  sessions without writing secret values to the deployment manifest.
- The reference-company smoke now reports node and output counts.

## Evidence

`bun run smoke:company:local` now exercises real deployment-backed OpenProse
runs:

| Entrypoint | Status | Node Runs | Outputs |
| --- | --- | ---: | ---: |
| `openprose-company` | `succeeded` | 1 | 1 |
| `intelligence-daily` | `succeeded` | 6 | 2 |
| `gtm-pipeline` | `succeeded` | 12 | 5 |
| `stargazer-daily` | `succeeded` | 7 | 2 |

The smoke state includes both deployment records and runtime run records:

- `runs/<deployment-run-id>/run.json`
- `runs/<deployment-run-id>/plan.json`
- `runtime-runs/<openprose-run-id>/run.json`
- `runtime-runs/<openprose-run-id>/nodes/...`
- `runtime-store/...`

## Tests

Passed:

```bash
bun test
bun run typecheck
bun run confidence:runtime
bun run smoke:company:local
```

Focused deployment tests also assert that a local trigger writes the runtime run
record and node/output counts.

## Remaining Depth

- The package runtime projection is now good enough to validate company-shaped
  deployments locally, but it still uses conservative static projection around
  ProseScript call wiring. A fuller Pi meta-harness should eventually pass
  child run outputs into parent node prompts as first-class internal bindings.
- The local dry-run runner emits deterministic fixture outputs. Live Pi
  inference should be added as a separate acceptance ladder once platform/dev
  orchestration has the same package-entrypoint semantics.
- Platform integration should consume the same package-entrypoint runtime IR
  shape rather than reconstructing package graph behavior independently.

## Next

Proceed to the platform implementation phases:

1. Persist deployment records in the platform data model.
2. Trigger deployment entrypoints through the control plane.
3. Reuse the OSS package-entrypoint runtime IR projection for distributed
   Sprites node execution.
4. Surface deployment runs, node runs, current pointers, and artifacts in the
   hosted UI.

