# North-Star Examples

These are the examples RFC 014 should create or promote. Names may change
during implementation, but the capability ladder should stay intact.

The suite is intentionally not weighted evenly. A simple single-component
example is useful for smoke testing, but the real north-star pressure should
come from examples where OpenProse behaves like React for agent outcomes:

- a graph node receives typed "props" from upstream materialized runs
- only stale nodes re-run
- reused nodes keep their prior run/session/artifact refs
- each executed node becomes a persisted Pi session
- memory and high-water marks are committed only when the graph succeeds
- human gates block before an agent session is launched
- model provider/model choices are recorded separately from the graph VM

## Weighting Summary

| Tier | Examples | Why They Matter |
| --- | --- | --- |
| A: Runtime-defining | `lead-program-designer`, `stargazer-intake-lite`, `release-proposal-dry-run`, `merged-pr-fit-review-lite` | These force the Pi meta-harness, selective recompute, memory, gates, and prior-run reuse to be real. |
| B: Showcase | `agent-ecosystem-index-refresh`, `customer-repo-scaffold-preview`, `opportunity-discovery-lite` | These show why materialized graph outcomes beat long prompt chains. |
| C: Smoke | `company-signal-brief` | This proves a real one-component run and live Pi inference, but it is not enough by itself. |

## 1. `company-signal-brief`

Source inspiration:

- `systems/distribution/responsibilities/mention-intelligence.prose.md`
- `systems/distribution/responsibilities/opportunity-discovery.prose.md`

Shape:

- one component
- pure or read-only synthesis over caller-provided notes
- outputs a concise business brief

Why it matters:

- proves the smallest useful OpenProse program is not a toy greeting
- gives the single-run portability path a real business artifact
- good first live Pi smoke with a cheap model
- intentionally low React-like weight; it exists to keep the on-ramp honest

Backpressure:

- typed inputs and outputs
- deterministic scripted Pi output
- live Pi output quality eval
- trace captures Pi session metadata

## 2. `lead-program-designer`

Source inspiration:

- `systems/revenue/responsibilities/lead-enrichment.prose.md`
- `systems/revenue/responsibilities/program-designer.prose.md`

Shape:

- three node graph: normalize profile -> score qualification -> draft Save/Grow
  programs
- no external reads in the first version; caller provides the enriched profile

Why it matters:

- proves multi-node synthesis over typed artifacts
- tests upstream artifact propagation and selective recompute: this is the
  first "props changed, only affected component re-renders" example
- stays simple enough to inspect by hand
- proves each stale node maps to one persisted Pi session, while reused nodes
  keep prior OpenProse run refs

Backpressure:

- only re-run program drafting when brand context changes
- only re-run scoring when profile changes
- eval catches generic, non-specific program drafts
- run record proves session count equals executed stale node count

## 3. `stargazer-intake-lite`

Source inspiration:

- `systems/distribution/workflows/stargazer-daily.prose.md`
- `systems/distribution/responsibilities/stargazer-intake.prose.md`
- `shared/adapters/github/stargazer-poller.prose.md`

Shape:

- poller fixture input -> rank -> enrich selected stargazers -> update memory
  artifact -> digest
- first pass uses caller-provided GitHub star JSON rather than live GitHub

Why it matters:

- introduces project memory, high-water marks, idempotence, and safe replay
- tests "same graph, new upstream data" behavior
- shows how company operating loops become durable run state
- proves that repeated company operations can be modeled as reactive state
  transitions, not new one-off chats

Backpressure:

- duplicate star fixture must not duplicate output
- high-water mark must advance only on successful graph completion
- Slack digest must exclude sensitive enrichment fields
- failed downstream node must not commit memory/high-water artifacts

## 4. `opportunity-discovery-lite`

Source inspiration:

- `systems/distribution/responsibilities/opportunity-discovery.prose.md`
- `systems/distribution/services/platform-scanner.prose.md`

Shape:

- scan results -> classify -> deduplicate -> summarize
- caller-provided platform scan fixture in v1

Why it matters:

- tests larger fan-out/fan-in graph shape without external IO first
- exercises ranking, recency, dedupe, and "answer first" policy
- proves OpenProse can materialize ranked operating judgment as structured
  downstream state

Backpressure:

- old opportunities are rejected
- duplicate cross-posts collapse to highest-reach source
- each surfaced opportunity includes quality reasoning
- trace links every surfaced opportunity to the source scan rows it consumed

## 5. `release-proposal-dry-run`

Source inspiration:

- `systems/product-engineering/workflows/release-on-demand.prose.md`
- `systems/product-engineering/responsibilities/openprose-release.prose.md`

Shape:

- git/change fixture -> summarizer -> release proposal -> human gate -> digest
- dry-run only at first; no repo mutation

Why it matters:

- introduces human gates and release-grade effect policy
- tests that approval happens before mutating steps and before Pi sessions for
  gated nodes are launched
- aligns with real OpenProse product-engineering work
- proves policy is part of the graph runtime, not just text in the prompt

Backpressure:

- no release path skips approval when user-visible changes exist
- no-op release skips approval and returns `not_required`
- low coverage or fabricated SHA seeded-bad fixtures fail
- missing approval creates a blocked OpenProse run record with no Pi session ref

## 6. `customer-repo-scaffold-preview`

Source inspiration:

- `systems/revenue/workflows/gtm-pipeline.prose.md`
- `systems/revenue/responsibilities/customer-repo-scaffolder.prose.md`

Shape:

- lead profile + Save/Grow program pair -> scratch customer repo preview
- writes into a temp workspace, never the real repo during tests

Why it matters:

- tests controlled `mutates_repo`
- proves OpenProse can generate structured multi-file artifacts
- gives an enterprise buyer the clearest "Company as Code" demo
- proves scratch-workspace effects can be declared, authorized, performed, and
  audited as graph-node outputs

Backpressure:

- refuses to overwrite existing customer slug
- produces `responsibilities/`, `services/`, `workflows/`, and `evals/`
- seeded-bad output using old `delivery/` path fails
- performed file effects must match declared/allowed effects

## 7. `agent-ecosystem-index-refresh`

Source inspiration:

- `systems/distribution/workflows/agent-index-refresh.prose.md`
- `systems/distribution/responsibilities/agent-ecosystem-index.prose.md`

Shape:

- build crawl targets -> crawl batches -> aggregate/score -> render artifacts
- model tiers are part of runtime intent: cheap crawl, stronger score,
  strongest curation

Why it matters:

- tests serial batches plus parallel fan-out
- captures "use different model strength per node" as a real runtime need
- produces public artifact outputs that are easy to inspect
- forces OpenProse to separate graph VM choice from model provider/model
  routing: this should be Pi sessions using different model settings, not
  different OpenProse providers

Backpressure:

- every referenced platform has a status row
- every notable item has a URL
- security posture cannot be `clear` without cited evidence
- measurement report includes model/provider/cost by node attempt

## 8. `merged-pr-fit-review-lite`

Source inspiration:

- `systems/product-engineering/responsibilities/merged-pr-fit-review.prose.md`

Shape:

- prior memory + merged PR fixture -> parallel PR audit -> memory update ->
  summary

Why it matters:

- tests prior-run/memory reuse, parallel independent nodes, caching, and
  "current HEAD" invalidation
- gives the framework a real self-improvement loop
- proves OpenProse can materialize review state over time instead of asking an
  agent to remember what happened in a chat

Backpressure:

- already-reviewed PRs are skipped
- changed `spirit_anchors` invalidates prior reviews
- seeded hallucinated file recommendation fails eval
- parallel review node sessions fan into one adjudicated summary

## Future Composite Showcases

These are not first implementation targets, but they are the shape we are
optimizing toward.

### `company-operating-cascade`

A company positioning update flows into lead program drafts, release narrative,
and distribution briefs. Only nodes whose typed inputs changed re-run.

### `market-response-loop`

New stargazers and platform opportunities update lead ranking, outreach
angles, and an operator digest across repeated runs with memory.

### `release-to-distribution-loop`

Merged PRs feed a release proposal, a gated announcement draft, docs follow-up,
and a distribution opportunity brief.

### `strategy-review-board`

Several graph nodes critique a plan from different roles, then an adjudicator
node materializes the disagreements and decisions. This is the OpenProse
version of subagents: graph nodes with typed outcomes, persisted sessions, and
auditable fan-in.
