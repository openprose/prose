# OpenProse Docs

OpenProse is now split into a few clean surfaces:

- [Why and When to Use OpenProse](why-and-when.md): what it is for, when it wins, and when not to reach for it
- [What Shipped](what-shipped.md): a compact snapshot of the compiler, planner, package, runtime, and hosted surfaces that exist today
- [Measuring OpenProse](measurement.md): reproducible ways to measure package quality, selective recompute, approval gating, and reference-company health
- [Inference Examples](inference-examples.md): Pi-backed graph VM examples,
  model provider setup, and live harness evidence
- [Runtime Release Candidate](release-candidate.md): confidence matrix,
  release criteria, and generated RC evidence
- [Diagrams](diagrams/index.html): HTML diagrams for the compiler, reactive
  planning, inference meta-harness, packages, approvals, and runtime backpressure
- [Examples](../examples/README.md): the curated example set that matches the current local-first/runtime model

## Quickstart

From this repo:

```bash
bun install
bun run prose compile examples/north-star/company-signal-brief.prose.md
bun run prose plan examples/north-star/lead-program-designer.prose.md \
  --input lead_profile='{"company":"Acme","pain":"manual agent handoffs"}' \
  --input brand_context="OpenProse is React for agent outcomes." \
  --target-output lead_program_plan
bun run prose graph examples/north-star/release-proposal-dry-run.prose.md \
  --input release_candidate="v0.11.0"
bun run prose run examples/north-star/company-signal-brief.prose.md \
  --run-id docs-company-signal \
  --input signal_notes="Customer teams want durable agent workflows." \
  --input brand_context="OpenProse is React for agent outcomes." \
  --output company_signal_brief="Hello from the local runtime."
bun run prose status .prose/runs
bun run prose trace .prose/runs/docs-company-signal
bun run measure:examples
bun run confidence:runtime
bun run smoke:live-pi
```

## Mental Model

OpenProse is not "just markdown."

It is a contract-first system for agent programs with:

- canonical `.prose.md` source
- a deterministic Prose IR
- graph planning and selective recompute
- durable run materialization through the local Pi-backed meta-harness
- package metadata, install, search, and publish checks
- hosted graph/run/approval surfaces built on the same IR and run model

The docs in this directory are meant to make that visible without asking readers to reconstruct it from RFCs and source code.
