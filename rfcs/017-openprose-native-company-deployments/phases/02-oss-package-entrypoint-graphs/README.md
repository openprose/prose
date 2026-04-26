# Phase 02: OSS Package Entrypoint Graphs

Goal: plan and inspect real workflows across a multi-file package, not just one
source file.

The reference-company package already compiles into a package graph. This phase
turns that package graph into the execution input for deployment workflows.

## Sub-Phases

1. [`01-package-graph-planning-api.md`](subphases/01-package-graph-planning-api.md)
2. [`02-service-resolution-execution.md`](subphases/02-service-resolution-execution.md)
3. [`03-package-graph-cli.md`](subphases/03-package-graph-cli.md)

## Tests

- `bun run typecheck`
- `bun test`
- `bun run prose compile /Users/sl/code/openprose/customers/prose-openprose --no-pretty`
- Package graph tests for `gtm-pipeline` and `intelligence-daily`

## Commit

Commit after every sub-phase.

## Signpost

Add a signpost after every sub-phase.
