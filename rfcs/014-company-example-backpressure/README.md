# RFC 014: Company Example Backpressure Suite

**Status:** Draft plan
**Date:** 2026-04-26
**Scope:** `openprose/prose` OSS package, with source inspiration from `customers/prose-openprose`

## Summary

OpenProse needs a small set of real-world examples that act as north-star
backpressure while the runtime is reshaped around the ideal model:

```text
single component run -> portable agent harness execution
reactive graph run   -> Pi SDK-backed OpenProse meta-harness
```

This RFC is therefore not just an examples plan. It is also the pressure test
for the most important runtime change in the current branch: OpenProse must
stop treating "provider" as one flat concept, and must instead distinguish:

- the harness that can execute one component
- the Pi SDK-backed graph VM that coordinates many component runs
- the model provider used inside that VM, such as OpenRouter
- the model and reasoning posture selected per run or node
- the durable OpenProse run store that materializes node outcomes

The existing `customers/prose-openprose` repository already contains the right
domains: distribution intelligence, stargazer intake, GTM lead-to-demo
scaffolding, release operations, and merged-PR fit review. This RFC turns those
company programs into a graduated example suite that starts simple and ends at
enterprise-shaped workflows with memory, effects, gates, retries, evals,
measurements, and real Pi inference.

This suite is not marketing demo content first. It is runtime backpressure. If
the examples become hard to run, hard to inspect, or hard to trust, the package
has drifted away from its North Star.

## Design Principles

- Use the company repo as source material, but keep examples small enough to
  run locally and debug quickly.
- Prefer examples where reactive materialized outcomes beat ordinary prompt
  chains: selective recompute, durable memory, gates, fan-out/fan-in, prior-run
  reuse, and inspectable provenance.
- Make Pi SDK the default runtime substrate for reactive graph examples. In a
  graph, OpenProse subagents are graph nodes, and each executed/stale node gets
  its own persisted Pi session.
- Preserve single-run portability in the source model, but do not let shell-out
  harness adapters clutter the reactive graph runtime.
- Keep model providers separate from harnesses. OpenRouter is a model provider
  used through the Pi-backed graph VM, not an OpenProse graph runtime.
- Keep deterministic backpressure through scripted Pi-session test doubles, not
  a public `fixture` runtime concept.
- Require structured output submission through an OpenProse Pi tool so graph
  runs are validated as typed materializations, not scraped text transcripts.
- Every example needs an eval, a measurement, and at least one seeded-bad case
  by the time it graduates into the release matrix.
- Commit and signpost after every implementation slice.

## Required Pi Runtime Changes

The examples in this RFC are deliberately chosen to force these OSS package
changes:

1. Replace the flat public `provider` model with explicit runtime layers:
   single-run harness, reactive graph VM, model provider, model, tools, and
   persistence.
2. Promote Pi SDK from "one possible provider" into the default graph VM for
   reactive execution.
3. Introduce a Pi session factory owned by OpenProse, with one persisted
   session per executed graph node.
4. Give every Pi node session a strict OpenProse prompt envelope containing
   typed inputs, upstream run refs, expected outputs, allowed effects, stale
   reason, acceptance criteria, and output submission instructions.
5. Add an OpenProse Pi custom tool, `openprose_submit_outputs`, as the primary
   path for typed outputs and performed effects.
6. Normalize Pi lifecycle/model/tool events into OpenProse trace events and run
   attempts.
7. Apply policy gates before launching Pi sessions, so blocked mutating work
   creates no stray agent state.
8. Keep deterministic scripted Pi sessions internal to tests; do not expose a
   fake runtime as an author-facing provider.

The fuller runtime-change plan is in
[`pi-runtime-changes.md`](pi-runtime-changes.md).

The implementation-readiness scan is in
[`implementation-readiness.md`](implementation-readiness.md). It records what
to keep, what to delete, and why implementation should start with Phase 02
before the example suite grows.

## Company Source Material Reviewed

- `customers/prose-openprose/README.md`
- `customers/prose-openprose/ARCHITECTURE.md`
- `customers/prose-openprose/EVALS.md`
- `systems/distribution/workflows/intelligence-daily.prose.md`
- `systems/distribution/workflows/stargazer-daily.prose.md`
- `systems/distribution/workflows/agent-index-refresh.prose.md`
- `systems/distribution/responsibilities/opportunity-discovery.prose.md`
- `systems/revenue/workflows/gtm-pipeline.prose.md`
- `systems/revenue/responsibilities/customer-repo-scaffolder.prose.md`
- `systems/product-engineering/workflows/release-on-demand.prose.md`
- `systems/product-engineering/responsibilities/merged-pr-fit-review.prose.md`

## Pi SDK Capabilities This Plan Leans On

The Pi SDK gives OpenProse enough control to make the reactive runtime serious:

- `createAgentSession()` for one component session.
- `SessionManager.create()` for persisted sessions.
- `SessionManager.inMemory()` for deterministic tests.
- model provider and model selection through `ModelRegistry`.
- runtime API key overrides through `AuthStorage.setRuntimeApiKey()`.
- `session.subscribe()` for model, tool, turn, and lifecycle events.
- `session.abort()` for cancellation.
- `customTools` / extensions for structured output submission and runtime
  guards.
- session JSONL files for durable trace references.

## Example Ladder

See [`examples.md`](examples.md) and
[`reactive-example-strategy.md`](reactive-example-strategy.md) for full
details.

1. `company-signal-brief`
2. `lead-program-designer`
3. `stargazer-intake-lite`
4. `opportunity-discovery-lite`
5. `release-proposal-dry-run`
6. `customer-repo-scaffold-preview`
7. `agent-ecosystem-index-refresh`
8. `merged-pr-fit-review-lite`

The ladder includes one simple smoke example, but the suite is weighted toward
workflows that a React-like agent framework should uniquely excel at: living
artifacts that update when upstream facts change, materialized subresults that
can be reused, multi-node deliberation, durable memory, and policy-gated
mutation.

## Phase Tree

- [`phases/README.md`](phases/README.md)
- [`phases/01-example-ladder-and-fixtures`](phases/01-example-ladder-and-fixtures/)
- [`phases/02-pi-first-runtime-backpressure`](phases/02-pi-first-runtime-backpressure/)
- [`phases/03-simple-company-graphs`](phases/03-simple-company-graphs/)
- [`phases/04-reactive-company-loops`](phases/04-reactive-company-loops/)
- [`phases/05-gated-and-mutating-workflows`](phases/05-gated-and-mutating-workflows/)
- [`phases/06-measurement-and-release-gates`](phases/06-measurement-and-release-gates/)
- [`phases/07-reference-company-sync`](phases/07-reference-company-sync/)

## Backpressure Matrix

| Capability | First Example | Pi Runtime Requirement |
| --- | --- | --- |
| Single component execution | `company-signal-brief` | Run one component through a compatible harness without invoking the graph VM. |
| Multi-node graph execution | `lead-program-designer` | Plan stale/current nodes and launch one Pi session per executed node. |
| Upstream artifact propagation | `lead-program-designer` | Build typed Pi prompts from upstream run materializations. |
| Selective recompute | `lead-program-designer` | Reuse current node runs without creating new Pi sessions. |
| Stateful operating loop | `stargazer-intake-lite` | Materialize memory/high-water artifacts only after graph success. |
| Prior run as input | `merged-pr-fit-review-lite` | Pass prior materializations into new Pi sessions as typed context. |
| Human gate | `release-proposal-dry-run` | Block gated nodes before session creation and record gate provenance. |
| Mutating scratch workspace | `customer-repo-scaffold-preview` | Surface allowed effects in the Pi prompt and validate performed effects. |
| Parallel fan-out/fan-in | `agent-ecosystem-index-refresh` | Run independent Pi node sessions and aggregate typed outputs. |
| Model tier routing | `agent-ecosystem-index-refresh` | Separate model provider/model selection from harness/runtime selection. |
| Seeded-bad evals | `lead-program-designer` | Validate structured outputs semantically, not by transcript shape. |
| Live inference smoke | `company-signal-brief` | Exercise Pi + OpenRouter as graph substrate/model provider layers. |

## Commit And Signpost Discipline

Every sub-phase must end with:

1. Tests run and recorded.
2. A signpost in `rfcs/014-company-example-backpressure/signposts/`.
3. A commit with a narrow message.

Signposts should include:

- what changed
- what example or runtime capability it advances
- how it was tested
- what remains next
- any runtime/RFC learnings discovered while implementing

## Exit Criteria

RFC 014 is complete when:

- all examples compile as an OSS package
- each example has deterministic scripted-Pi tests
- at least three examples have live Pi smoke instructions
- at least one simple and one complex example have successful live Pi runs
- the measurement script reports example quality, runtime cost/duration, and
  selective recompute savings
- the release confidence matrix includes the example suite
- `customers/prose-openprose` has a clear reference path to consume or mirror
  the examples without becoming the test harness itself
