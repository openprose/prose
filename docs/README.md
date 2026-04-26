# OpenProse Docs

OpenProse is now split into a few clean surfaces:

- [Why and When to Use OpenProse](why-and-when.md): what it is for, when it wins, and when not to reach for it
- [What Shipped](what-shipped.md): a compact snapshot of the compiler, planner, package, runtime, and hosted surfaces that exist today
- [Measuring OpenProse](measurement.md): reproducible ways to measure package quality, selective recompute, approval gating, and reference-company health
- [Runtime Release Candidate](release-candidate.md): confidence matrix,
  release criteria, and generated RC evidence
- [Diagrams](diagrams/index.html): HTML diagrams for the compiler, reactive
  planning, packages, approvals, and runtime backpressure
- [Examples](../examples/README.md): the curated example set that matches the current local-first/runtime model

## Quickstart

From this repo:

```bash
bun install
bun run prose compile examples/hello.prose.md
bun run prose plan examples/selective-recompute.prose.md \
  --input draft="A stable draft." \
  --input company="openprose"
bun run prose graph examples/approval-gated-release.prose.md \
  --input release_candidate="v0.11.0"
bun run prose run examples/hello.prose.md \
  --provider fixture \
  --run-id docs-hello \
  --output message="Hello from the local runtime."
bun run prose status .prose/runs
bun run prose trace .prose/runs/docs-hello
bun run measure:examples
```

## Mental Model

OpenProse is not "just markdown."

It is a contract-first system for agent programs with:

- canonical `.prose.md` source
- a deterministic Prose IR
- graph planning and selective recompute
- durable run materialization through the local meta-harness
- package metadata, install, search, and publish checks
- hosted graph/run/approval surfaces built on the same IR and run model

The docs in this directory are meant to make that visible without asking readers to reconstruct it from RFCs and source code.
