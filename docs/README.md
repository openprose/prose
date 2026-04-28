# OpenProse Docs

Start here:

- [Why and When to Use OpenProse](why-and-when.md): what it is for, when it wins, and when not to reach for it
- [Agent Onboarding](agent-onboarding.md): the checked path for a coding agent entering the repo cold
- [Public Surface](current-surface.md): a compact map of the compiler, planner, package, runtime, and hosted surfaces
- [Measuring OpenProse](measurement.md): reproducible ways to measure package quality, selective recompute, approval gating, and reference-company health
- [Evidence Classes](evidence-classes.md): what each confidence rung covers
- [Inference Examples](inference-examples.md): Pi-backed graph VM examples,
  model provider setup, and live harness evidence
- [Single-Run Handoff](single-run-handoff.md): the boundary for exporting one
  component contract to a compatible one-off harness
- [Subagents and Private State](subagents-private-state.md): intra-node child
  sessions, private state refs, `Catch` recovery, and harness portability
- [Package Publication](package-publication.md): the source workspace versus
  generated CLI artifact boundary
- [Hosted Runtime Contract](hosted-contract.md): the fixture boundary shared
  by OSS and the hosted platform
- [Schema Validation](schema-validation.md): what typed ports enforce
  versus what remains semantic package metadata
- [Runtime Confidence Gate](release-candidate.md): confidence matrix,
  release criteria, and generated confidence evidence
- [Diagrams](diagrams/index.html): HTML diagrams for the compiler, reactive
  planning, inference meta-harness, packages, approvals, and runtime backpressure
- [Examples](../examples/README.md): the curated example set for the local-first runtime model

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
bun run prose handoff examples/north-star/company-signal-brief.prose.md \
  --input signal_notes="Customer teams want durable agent workflows." \
  --input brand_context="OpenProse is React for agent outcomes."
bun run prose run examples/north-star/company-signal-brief.prose.md \
  --run-id docs-company-signal \
  --input signal_notes="Customer teams want durable agent workflows." \
  --input brand_context="OpenProse is React for agent outcomes." \
  --output company_signal_brief="Hello from the local runtime."
bun run prose status .prose/runs
bun run prose trace .prose/runs/docs-company-signal
bun run measure:examples
bun run confidence:runtime
bun run smoke:cold-start
bun run smoke:agent-onboarding
bun run smoke:live-pi
```

## Distribution

The repo root is a source workspace, not the public npm artifact. Use
`bun run prose ...` while developing here. `bun run build:binary` creates
`dist/prose` and writes a dist-specific `package.json` whose `bin.prose` points
at the compiled binary.

## Mental Model

OpenProse source is readable Markdown, but it compiles into an executable
contract:

- canonical `.prose.md` source
- a deterministic Prose IR
- graph planning and selective recompute
- durable run materialization through the local Pi-backed meta-harness
- package metadata, install, search, and publish checks
- hosted graph/run/approval surfaces over the same IR and run model

RFCs are design history. These docs describe the system a user runs.
