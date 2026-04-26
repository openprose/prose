# RFC 017 Open Questions

These are the decisions that should be reviewed before implementation starts in
earnest. Each includes the recommended answer so review can be quick.

## 1. Does a deployment map to a Git repository?

Recommended: no. A deployment maps to an org-scoped immutable package version
plus environment, policy, triggers, and mutable state/current pointers.

Git is source provenance and a source transport. It is not the live object. This
lets one repo publish multiple packages, one package have multiple deployments,
and one deployment promote from one source SHA to another without losing run
history.

## 2. Should a deployment have exactly one root package?

Recommended: yes for v1. A deployment has one root package version and its
locked dependencies. Multiple root packages should become multiple deployments
or a future workspace deployment.

This keeps current pointers, trigger ownership, policy, and package promotion
understandable.

## 3. Should workflows auto-enable from `cadence` declarations?

Recommended: no. `cadence` in source should be a proposal and metadata. The
deployment operator explicitly enables schedules/events in an environment.

This prevents surprises, keeps hosted triggers auditable, and lets dev/staging
deployments run dry.

## 4. Where should scheduling live?

Recommended: scheduling is outside the language core and inside deployment
runtime. OSS should provide a local supervisor for development and tests.
Hosted scheduling should live in the platform control plane.

Source declares intent; deployment runtime activates it.

## 5. How should deployment state relate to runs?

Recommended: runs remain immutable. Deployment pointers are mutable.

The deployment owns `current` and `latest` pointers for workflows, graph nodes,
outputs, memory resources, and trigger keys. Every pointer references immutable
run/artifact records.

## 6. Should platform deployments execute real external effects immediately?

Recommended: no. First acceptance uses dry-run adapters and explicit approvals.
Real Slack/GitHub/external writes come after the company can run safely end to
end with provenance, policy, and eval evidence.

## 7. Should package graph planning replace single-file graph planning?

Recommended: package graph planning should become the deployment path, while
single-file planning remains useful for isolated component development.

The dream state requires multi-file service resolution. Single-file graphing is
not enough to run an OpenProse Native Company.

## 8. Should the platform embed the OSS library or shell out to the CLI?

Recommended: use the CLI boundary for the next dev acceptance slice, but design
the DTOs and package APIs so direct library embedding can replace it later.

The CLI is already deployed and proven in the distributed provider. The data
model should not care which invocation mechanism is used.

## 9. Should deployments be visible/public like packages and runs?

Recommended: deployments are private/internal in v1. Public packages are useful;
public live company deployments are a later product and governance problem.

Runs/artifacts can keep existing visibility fields, but deployment records
should default private.

## 10. What is the first "company" acceptance mode?

Recommended: dev-safe dry-run mode with fixture and sandbox bindings.

The first proof should demonstrate service composition, reactive current
pointers, approvals, traces, and recompute savings without risking real Slack
posts, GitHub changes, or customer-facing artifacts.

