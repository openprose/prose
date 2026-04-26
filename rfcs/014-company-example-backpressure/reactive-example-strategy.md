# Reactive Example Strategy

The example suite should not merely prove that OpenProse can call an agent. A
plain skill or one-shot prompt can already do that. The suite should overweight
examples where OpenProse is uniquely strong once it becomes a React-like system
for agent outcomes.

## What OpenProse Should Excel At

| Advantage | What It Means | Examples That Pressure It |
| --- | --- | --- |
| Living artifacts | Outputs update when upstream facts change, without re-running everything. | `lead-program-designer`, `stargazer-intake-lite` |
| Materialized subresults | Intermediate outcomes are typed, inspectable, reusable, and measurable. | `lead-program-designer`, `agent-ecosystem-index-refresh` |
| Durable operating loops | A workflow runs repeatedly with memory, high-water marks, and idempotence. | `stargazer-intake-lite`, `merged-pr-fit-review-lite` |
| Policy-gated effects | Agent work can prepare mutations, but approval/policy controls execution. | `release-proposal-dry-run`, `customer-repo-scaffold-preview` |
| Parallel deliberation | Independent nodes can critique, score, or enrich in parallel before fan-in. | `agent-ecosystem-index-refresh`, `merged-pr-fit-review-lite` |
| Model-tier routing | Cheap and strong models can be used in different graph nodes intentionally. | `agent-ecosystem-index-refresh` |
| Provenance and audit | Every answer carries run refs, source refs, trace refs, and cost posture. | all graduated examples |

## Weighting

The suite should be evaluated with this priority:

### Tier A: Core React-Like Backpressure

These examples should drive runtime design and release confidence.

- `lead-program-designer`: smallest graph that proves typed props, upstream
  artifact propagation, and selective recompute.
- `stargazer-intake-lite`: first durable operating loop with memory,
  high-water marks, idempotence, and replay.
- `release-proposal-dry-run`: first human-gated workflow where policy blocks
  work before Pi sessions are launched.
- `merged-pr-fit-review-lite`: first self-improvement loop with prior-run reuse
  and invalidation.

### Tier B: Showcase Backpressure

These examples should demonstrate why the framework is bigger than a prompt
chain once the core is stable.

- `agent-ecosystem-index-refresh`: parallel crawl/score/curate pipeline with
  model-tier routing.
- `customer-repo-scaffold-preview`: controlled scratch mutation and multi-file
  artifact production.
- `opportunity-discovery-lite`: fan-out/fan-in ranking, dedupe, and
  answer-first synthesis.

### Tier C: Smoke And On-Ramp

These examples are still useful, but they are not sufficient proof of the
framework.

- `company-signal-brief`: proves the smallest useful single component and
  cheap live Pi smoke, but it should not dominate the roadmap.

## Outside-The-Box Composite Examples

After the base ladder works, we should create composite examples that combine
the smaller pieces into workflows only a materialized reactive framework can
make pleasant:

1. `company-operating-cascade`
   - A positioning update invalidates only the affected lead program, release
     narrative, and distribution brief nodes.
   - Proves that company knowledge can behave like shared state with typed
     downstream materializations.

2. `market-response-loop`
   - New stargazers and platform opportunities update lead ranking, outreach
     angles, and an operator digest.
   - Proves durable memory plus repeated graph execution over changing market
     facts.

3. `release-to-distribution-loop`
   - Merged PRs produce a release proposal, gated announcement draft, docs
     update checklist, and distribution opportunity brief.
   - Proves policy-gated mutation plus downstream fan-out.

4. `strategy-review-board`
   - Several Pi node sessions independently critique a plan from different
     roles, then an adjudicator node materializes disagreements and decisions.
   - Proves OpenProse graph nodes can stand in for subagents without requiring
     Pi-native subagents.

These should not be implemented before the base ladder. They exist to keep the
design honest: the ideal OpenProse package should make these feel natural, not
bolted on.
