<p align="center">
  <img src="assets/readme-header.svg" alt="OpenProse - Engineer your agents" width="100%" />
</p>

<p align="center">
  <strong>Contract-first, reactive software for agent workflows.</strong>
</p>

<p align="center">
  <a href="https://prose.md">Website</a> |
  <a href="docs/README.md">Docs</a> |
  <a href="docs/agent-onboarding.md">Agent Onboarding</a> |
  <a href="docs/why-and-when.md">Why / When</a> |
  <a href="examples/README.md">Examples</a> |
  <a href="packages/std/">Stdlib</a> |
  <a href="packages/co/">Company as Code</a> |
  <a href="skills/open-prose/SKILL.md">Skill Spec</a>
</p>

<p align="center">
  <code>npx skills add openprose/prose</code>
</p>

---

OpenProse is a programming language for agent workflows.

You write canonical `.prose.md` source with typed inputs, typed outputs, effects, access rules, and optional execution blocks. OpenProse compiles that source into IR, explains the graph, compares it to prior runs, materializes durable run records through the local graph VM, and turns packages into something you can search, install, benchmark, and serve through the hosted platform.

## Start Here

- [Docs](docs/README.md)
- [Why and When to Use OpenProse](docs/why-and-when.md)
- [What Shipped](docs/what-shipped.md)
- [Agent Onboarding](docs/agent-onboarding.md)
- [Curated Examples](examples/README.md)
- [Measurement Harness](docs/measurement.md)
- [Runtime Confidence Gate](docs/release-candidate.md)
- [HTML Diagrams](docs/diagrams/index.html)

## What Exists Today

The local-first CLI surface is real:

```bash
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
  --input signal_notes="Customer teams want durable agent workflows." \
  --input brand_context="OpenProse is React for agent outcomes." \
  --output company_signal_brief="Hello from the local runtime."
bun run prose status .prose/runs
bun run prose trace .prose/runs/{run-id}
bun run prose package examples
bun run prose publish-check examples --strict
bun run prose install registry://openprose/@openprose/examples@0.1.0/company-signal-brief \
  --catalog-root . \
  --workspace-root /tmp/openprose-workspace
bun run measure:examples
bun run confidence:runtime
bun run smoke:live-pi
```

Single components can be exported as one-off handoffs for compatible agent
harnesses:

```bash
bun run prose handoff examples/north-star/company-signal-brief.prose.md \
  --input signal_notes="Customer teams want durable agent workflows." \
  --input brand_context="OpenProse is React for agent outcomes."
```

A single component contract can still be handed to a compatible agent harness as a one-off task. For reactive graphs, the Bun CLI is the compiler/tooling/runtime-analysis surface and Pi is the local graph VM that OpenProse coordinates one persisted node session at a time.

## Why OpenProse

OpenProse is useful when a workflow is starting to look like software:

- more than one step or role
- reusable enough to deserve a name
- sensitive enough to need effects or approvals
- big enough that provenance and debugging matter
- structured enough that selective recompute is worth it

What it adds over baseline agent packages is not just orchestration. It adds:

- a readable contract surface
- a deterministic IR
- typed ports for composition
- effect declarations for safe planning
- runs as universal materialization records
- package metadata for install/search/publish discipline

## The Current Spine

```text
.prose.md source
  -> compile
  -> Prose IR
  -> plan / graph / manifest
  -> Pi-backed graph VM run materialization
  -> package metadata / install / publish-check / search
  -> hosted run + graph + approval surfaces
```

That shared spine is the important part. It means the docs, examples, package system, local runner, and hosted product are all describing the same underlying thing.

## Repository Map

| Path | What it is |
|---|---|
| [`docs/`](docs/README.md) | human docs for the current OpenProse model |
| [`examples/`](examples/README.md) | concise, high-signal examples of the current best practice |
| [`packages/std/`](packages/std/) | reusable primitives and standard-library components |
| [`packages/co/`](packages/co/) | company-operating-system starter patterns |
| [`skills/open-prose/`](skills/open-prose/) | the current OpenProse agent-skill router and onboarding surface |
| [`rfcs/`](rfcs/) | the design record for the reactive OpenProse architecture |

## Local Workflow

Install dependencies:

```bash
bun install
```

Typecheck and test:

```bash
bun run typecheck
bun run test
```

Try the examples:

```bash
bun run prose compile examples/north-star/company-signal-brief.prose.md
bun run prose plan examples/north-star/lead-program-designer.prose.md \
  --input lead_profile='{"company":"Acme","pain":"manual agent handoffs"}' \
  --input brand_context="OpenProse is React for agent outcomes." \
  --target-output lead_program_plan
bun run prose graph examples/north-star/release-proposal-dry-run.prose.md \
  --input release_candidate="v0.11.0"
```

Measure package health and reactive behavior:

```bash
bun run measure:examples
bun run confidence:runtime
bun run smoke:binary
bun run smoke:cold-start
bun run smoke:agent-onboarding
bun run smoke:live-pi
```

Build the distributable CLI:

```bash
bun run build:binary
./dist/prose help
```

The repository root package is marked private because it is the source
workspace, not the install artifact. Run it with `bun run prose ...` while
developing. The publishable package is generated in `dist/` and contains the
compiled `prose` binary plus its own package metadata.

`smoke:live-pi` skips by default. Set `OPENPROSE_LIVE_PI_SMOKE=1` and
Pi/OpenRouter credentials when you want opt-in model-backed evidence:

```bash
OPENPROSE_LIVE_PI_SMOKE=1 \
OPENPROSE_PI_API_KEY="$OPENROUTER_API_KEY" \
bun run smoke:live-pi -- --tier all --run-root .prose/live-pi-runs
```

## Hosted Platform

The platform side now has real package ingest, hosted runs, graph plans, approvals, and an operator surface. The compact snapshot lives in [docs/what-shipped.md](docs/what-shipped.md).

## Terms

By installing, you agree to the [Privacy Policy](PRIVACY.md) and [Terms of Service](TERMS.md).
