# 06.2 Trigger Distributed Execution

## Build

- Add deployment trigger endpoint:

```text
POST /orgs/:orgId/openprose-deployments/:deploymentId/workflows/:workflowId/triggers
```

- Use deployment config to build package-level graph execution request.
- Invoke the existing distributed provider.
- Persist deployment events and update latest/current pointers.

## Tests

- Trigger safe workflow with local-safe provider.
- Trigger safe workflow with distributed provider in dev smoke.
- Failed run updates latest pointer but not current pointer.
- Succeeded accepted run updates current pointer.

## Commit

Commit as `feat: trigger openprose deployment workflows`.

## Signpost

Record first hosted deployment trigger run ids.

