# RFC 017: OpenProse Native Company Deployments

Status: Draft/current

## North Star

Run the entire `customers/prose-openprose` repository as an OpenProse Native
Company in the dev environment.

That means an operator can publish or install the `@openprose/prose-openprose`
package, create a deployment for an organization, configure its environment,
enable selected workflows, trigger or schedule runs, inspect durable state, and
watch the company keep agent-produced outcomes current through React-like
dataflow over typed outcome contracts.

The goal is not to demo one more component. The goal is to make a company
repository behave like a living service-oriented architecture:

```text
OpenProse Native Repository
  -> immutable package version
  -> org deployment
  -> environment + secrets + policy + triggers
  -> package graph plans
  -> distributed node runs
  -> durable run/artifact/eval/current-pointer state
  -> operator cockpit
```

## Current Facts

The current system is close enough to make this real, but one level is missing.

- The OSS package can compile, package, publish-check, run, trace, evaluate,
  measure, and execute distributed node envelopes.
- The platform can ingest registry packages, create runs, create graph
  snapshots, gate effects, continue approved graphs, store artifacts in Tigris,
  and delegate node execution to Sprites.
- The reference company passes strict publish-check with 99 components and a
  quality score around 0.95.
- Package-level compile already sees a large package graph for
  `customers/prose-openprose`, including service execution edges.
- Single-file `graph` and `run` are still the wrong level for real workflows
  such as `gtm-pipeline` and `intelligence-daily`; those commands see external
  services as unresolved when run against one file.

The missing primitive is an OpenProse deployment.

## Deployment Definition

An OpenProse deployment is an org-scoped running installation of an immutable
package version.

It is not exactly a Git repository.

A Git repository is source provenance and a useful source transport. A
deployment is the live operational object:

- organization
- deployment name and slug
- root package version
- source git, source sha, and optional source subpath
- enabled workflows and entrypoints
- environment and secret bindings
- effect policy and approval policy
- trigger configuration
- mutable current/latest pointers
- immutable runs, attempts, artifacts, traces, and eval results
- deployment health and operator history

Recommended stable identity:

```text
org_id + deployment_slug + environment_id
```

The active package version belongs to a deployment release key, not the stable
deployment id. The same Git repository may publish multiple packages. The same
package version may have multiple deployments. A deployment may be promoted to
a newer package version without losing its state history. This keeps the system
useful for real companies with dev/staging/prod environments, demos, customer
forks, and private/public package boundaries.

## What This RFC Adds

RFC 016 answered where hosted graph execution lives:

- the control plane runs the OSS graph VM
- remote workers execute atomic node envelopes
- a graph run may cross workers
- a single node run does not cross workers

RFC 017 adds the layer above that:

- package-level entrypoint and workflow discovery
- local deployment manifests and deployment stores
- package graph planning over multi-file repositories
- local deployment run loops for OSS confidence
- platform deployment models, APIs, triggers, and cockpit
- dev acceptance that spins up `@openprose/prose-openprose` as a company

## Acceptance Target

The implementation is on track only when the dev platform can run this ladder:

1. Publish or ingest `@openprose/prose-openprose`.
2. Create an `openprose-company-dev` deployment in an org.
3. Configure environment bindings for safe/dry-run operation.
4. Enable the initial workflows:
   - `company.prose.md`
   - `systems/distribution/workflows/intelligence-daily.prose.md`
   - `systems/revenue/workflows/gtm-pipeline.prose.md`
   - `systems/distribution/workflows/stargazer-daily.prose.md`
5. Trigger `company.prose.md` and materialize the company map.
6. Trigger `intelligence-daily` in dry-run delivery mode and persist the
   briefing plus delivery receipt.
7. Trigger `gtm-pipeline` in dry-run mutation mode, block at the human gate,
   approve it, and continue to a scaffold preview without unsafe repo writes.
8. Trigger `stargazer-daily` with fixture or dev-safe GitHub data, preserve the
   high-water/current pointer, and prove replay does not duplicate work.
9. Inspect deployment health, latest outputs, run graph, approvals, eval status,
   artifacts, stale/current reasons, and recompute savings in the hosted UI.

## Non-Goals

- Do not build a custom agent harness.
- Do not make hosted behavior diverge from OSS semantics.
- Do not require production deployment before dev acceptance.
- Do not auto-enable every declared cadence without operator configuration.
- Do not perform real Slack, GitHub mutation, or external delivery in the first
  company acceptance path; use dry-run adapters and explicit effect gates first.
- Do not preserve backward compatibility with old experiments if they block the
  ideal deployment model.

## Open Questions

See [`open-questions.md`](open-questions.md).
