# Phase 03: OSS Local Deployment Runtime

Goal: make the OSS package able to run a package deployment locally before the
platform depends on it.

This is the local "company supervisor" layer. It should stay simple, file-based,
and inspectable.

## Sub-Phases

1. [`01-local-deployment-store.md`](subphases/01-local-deployment-store.md)
2. [`02-local-trigger-run-loop.md`](subphases/02-local-trigger-run-loop.md)
3. [`03-current-pointers.md`](subphases/03-current-pointers.md)
4. [`04-local-company-smoke.md`](subphases/04-local-company-smoke.md)

## Tests

- `bun run typecheck`
- `bun test`
- local deployment smoke against `customers/prose-openprose`
- `bun run measure:examples`
- `bun run confidence:runtime`

## Commit

Commit after every sub-phase.

## Signpost

Add a signpost after every sub-phase.
