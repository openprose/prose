# Phase 05: Platform Deployment Data Model

Goal: add durable hosted deployment records without changing runtime behavior
yet.

This phase begins platform implementation after the OSS deployment contract is
stable.

## Sub-Phases

1. [`01-prisma-schema.md`](subphases/01-prisma-schema.md)
2. [`02-api-contracts.md`](subphases/02-api-contracts.md)
3. [`03-policy-and-migrations.md`](subphases/03-policy-and-migrations.md)

## Tests

- `pnpm --filter @openprose/api typecheck`
- targeted API unit tests
- Prisma migration deploy against local/dev test database
- existing OpenProse integration smoke remains green

## Commit

Commit after every platform sub-phase on the platform branch.

## Signpost

Add a platform planning signpost after every sub-phase.
