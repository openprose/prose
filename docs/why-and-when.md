# Why and When to Use OpenProse

OpenProse is for agent workflows that have started to look like software:
repeatable, typed, inspectable, packaged, and safe enough to run again later.

It sits between two familiar options:

- looser than a custom orchestration codebase
- more structured than a prompt, notebook, or skill bundle

Use OpenProse when the workflow matters after the first run.

## What It Is

OpenProse is a contract-first system for agent programs. A `.prose.md` source
file can carry the workflow contract, graph shape, typed inputs and outputs,
effect declarations, access labels, package identity, and run materialization
model in one reviewable artifact.

Implemented today:

- local CLI tools for `compile`, `plan`, `graph`, `run`, `eval`, `remote
  execute`, `handoff`, `status`, `trace`, `package`, `publish-check`,
  `search`, and `install`
- curated examples for typed services, selective recompute, run-aware
  composition, approval-gated delivery, and company workflows
- local measurement for package quality, recompute savings, approval
  visibility, and reference-company health
- hosted platform surfaces in this repo for package ingest, registry reads,
  package install/resolve, runs, artifacts, traces, graphs, approvals, and
  operator inspection, including runtime backpressure for capacity, graph VM
  readiness, storage, approvals, and Sprite-backed workspaces

See [What Shipped](what-shipped.md), [Examples](../examples/README.md), and
[Measuring OpenProse](measurement.md) for the current surfaces.

## Use It When

Choose OpenProse when several of these are true:

- the workflow will run more than once
- the inputs and outputs deserve names and types
- more than one role, step, or reusable component is involved
- external reads or side effects need to be declared
- approvals, policy boundaries, or delivery receipts need to be visible
- debugging later requires runs, artifacts, traces, or graph provenance
- teams need package install, search, publish checks, or registry discipline
- a downstream result should update without replaying the whole workflow

The practical threshold is simple: if you would be nervous to keep the workflow
as a long prompt, but writing a bespoke orchestration service feels too heavy,
OpenProse is probably the right level of structure.

## What It Improves Over Plain Skills

Skills are good at giving an agent extra instructions and local know-how.
OpenProse is better when the work needs durable structure.

| Need        | Plain skill                   | OpenProse                                           |
| ----------- | ----------------------------- | --------------------------------------------------- |
| Review      | Read instruction text         | Review typed `.prose.md` contracts and effects      |
| Composition | Hope prompts line up          | Connect named, typed ports                          |
| Planning    | Infer steps from prose        | Compile and inspect graph plans                     |
| Safety      | Rely on convention            | Declare effects and approval gates                  |
| Reuse       | Copy or invoke instructions   | Package, install, resolve, and search components    |
| Debugging   | Reconstruct from chat history | Inspect runs, artifacts, traces, and graph state    |
| Measurement | Mostly qualitative            | Emit local package, recompute, and approval metrics |

That does not make skills obsolete. Skills remain the right shell for agent
behavior, tool instructions, and host-specific guidance. OpenProse is the layer
to reach for when a skill starts carrying an implicit workflow API.

## Good Fits

OpenProse is especially useful for:

- content and research pipelines with reusable roles
- approval-gated release, publishing, or delivery flows
- company-operating-system workflows with explicit inputs and outputs
- packageable agent services that need install and publish discipline
- workflows where selective recompute saves time, cost, or review effort
- teams that want repo-native provenance before scaling to hosted execution

Concrete starting points:

- [`company-signal-brief.prose.md`](../examples/north-star/company-signal-brief.prose.md)
  for the smallest useful typed service
- [`lead-program-designer.prose.md`](../examples/north-star/lead-program-designer.prose.md)
  for target-output planning and selective recompute
- [`release-proposal-dry-run.prose.md`](../examples/north-star/release-proposal-dry-run.prose.md)
  for unsafe effects and human approval
- [`stargazer-intake-lite.prose.md`](../examples/north-star/stargazer-intake-lite.prose.md)
  for memory-oriented operating loops

## Poor Fits

Do not start with OpenProse when:

- the task is a one-shot question
- the fastest path is a short interactive conversation
- the workflow shape is still unknown
- the work has no reusable contract, provenance need, or policy boundary
- ordinary application code is already the simpler, clearer abstraction

OpenProse earns its keep when the contract matters.

## Hosted and Enterprise Work

The OSS package is the local compiler, package, graph-planning, run, and
confidence spine. Hosted OpenProse builds on that spine with enterprise
control-plane features:

- production-like deployed dev interop for the hosted API and Run app
- richer hosted publish/install ergonomics
- clearer policy and provenance UX for approvals and artifact visibility
- broader measurement harnesses comparing OpenProse workflows with baseline
  prompt or skill implementations
