# 05.1 Prisma Schema

## Build

- Add hosted deployment models:
  - `OpenProseDeployment`
  - `OpenProseDeploymentWorkflow`
  - `OpenProseDeploymentTrigger`
  - `OpenProseDeploymentPointer`
  - `OpenProseDeploymentEvent`
- Link deployments to orgs, users, compiled package versions, environments,
  runs, graphs, and approvals.
- Keep deployments private by default.

## Tests

- Prisma format/generate.
- Migration applies locally.
- Unit test cascade/delete behavior where relevant.
- Existing registry/run tests still pass.

## Commit

Commit as `feat: add openprose deployment schema`.

## Signpost

Record schema decisions and migration name.

