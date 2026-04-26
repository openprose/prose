# 06.4 Approval Continuation State

## Build

- Link approvals to deployment, workflow, graph, and node.
- Continue approved graphs using deployment configuration.
- Update deployment pointers after continuation.
- Preserve existing approval queue behavior.

## Tests

- `gtm-pipeline` blocks on human gate.
- Approval continuation creates a new run tied to the deployment.
- Rejected approval prevents continuation.
- Approval history is visible from deployment detail.

## Commit

Commit as `feat: link approvals to deployments`.

## Signpost

Record a human-gated dev workflow trace.

