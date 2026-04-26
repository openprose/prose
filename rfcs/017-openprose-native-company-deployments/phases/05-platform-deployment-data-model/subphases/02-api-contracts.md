# 05.2 API Contracts

## Build

- Add DTOs for:
  - create deployment
  - update deployment config
  - enable/disable workflow
  - configure trigger
  - list deployment status
  - read latest pointers
- Keep execution endpoints out until Phase 06.

## Tests

- DTO validation tests.
- Controller/service unit tests for create/list/read/update.
- RBAC tests for org membership and registry scopes.
- Run `pnpm --filter @openprose/api typecheck`.

## Commit

Commit as `feat: add openprose deployment api contracts`.

## Signpost

Record endpoint paths and auth assumptions.

