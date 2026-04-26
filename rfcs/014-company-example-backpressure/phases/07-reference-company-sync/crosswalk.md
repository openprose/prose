# Reference Company Crosswalk

Date: 2026-04-26
Branch: `rfc/reactive-openprose`

This crosswalk maps the north-star example ladder back to the reference company
source tree in `customers/prose-openprose`. Phase 07 should use it to decide
which company contracts deserve source updates after the OSS runtime patterns
have proven themselves.

The customer repo currently has local `.prose/` runtime artifacts in progress,
so this slice is read-only with respect to `customers/prose-openprose`.

## Pattern Summary

The examples clarified the company-source shape we should promote:

- graph nodes receive typed props, not ambient prose context
- intermediate artifacts are named and typed so downstream nodes can reuse them
- memory writes are modeled as proposed deltas until the graph succeeds
- unsafe effects block before the Pi session starts
- mutating workflows have a pure plan before the mutating node
- outputs are submitted through the structured output tool and then
  materialized as runs
- model-provider choices are recorded as runtime metadata, not treated as graph
  runtime identity

## Example To Company Map

| North-star example | Reference company source | What it represents | Sync candidate |
| --- | --- | --- | --- |
| `company-signal-brief` | `README.md`, `records/`, cross-system operating notes | Smallest useful typed company service over caller-provided evidence | Consider a shared signal-synthesis capability only if multiple systems start needing the same brief shape. No immediate source change required. |
| `lead-program-designer` | `systems/revenue/responsibilities/program-designer.prose.md`, `systems/revenue/services/qualification-scorer.prose.md`, `systems/revenue/services/program-drafter.prose.md`, `systems/revenue/workflows/gtm-pipeline.prose.md` | Revenue graph where normalized lead data, qualification score, and Save/Grow plan should be separately materialized | Promote the example's named intermediate outputs into the company contract so brand-context changes can re-run only program drafting. |
| `stargazer-intake-lite` | `systems/distribution/responsibilities/stargazer-intake.prose.md`, `systems/distribution/workflows/stargazer-daily.prose.md`, `shared/adapters/github/stargazer-poller.prose.md` | Daily operating loop with high-water marks, dedupe, enrichment, memory, and digest output | Split batch delta, prioritization, enrichment records, memory delta, and digest into explicit outputs. Keep `writes_memory` as a post-graph effect. |
| `opportunity-discovery-lite` | `systems/distribution/responsibilities/opportunity-discovery.prose.md`, `systems/distribution/services/platform-scanner.prose.md`, `systems/distribution/services/opportunity-classifier.prose.md`, `systems/distribution/services/opportunity-deduplicator.prose.md` | Fan-out/fan-in market sensing with source provenance and duplicate collapse | Adopt the example's `platform_scan_window`, `opportunity_classifications`, `opportunity_dedupe_report`, and source-linked summary outputs. |
| `release-proposal-dry-run` | `systems/product-engineering/responsibilities/openprose-release.prose.md`, `systems/product-engineering/workflows/release-on-demand.prose.md`, `systems/product-engineering/services/commit-summarizer.prose.md`, `systems/product-engineering/services/release-publisher.prose.md` | Gated delivery graph where a pure decision path precedes release notes and announcement delivery | Add a clearer pure release-decision output before gated publish/deliver work. Preserve dry-run planning as first-class source, not a test-only behavior. |
| `customer-repo-scaffold-preview` | `systems/revenue/responsibilities/customer-repo-scaffolder.prose.md`, `shared/capabilities/scaffolding/directory-builder.prose.md`, `shared/capabilities/evaluation/eval-writer.prose.md`, `systems/revenue/workflows/gtm-pipeline.prose.md` | Mutating customer-repo workflow with a pure plan and scratch preview before writes | Split pure repo planning from scratch mutation. Emit preview hashes before any committed customer asset is written. |
| `agent-ecosystem-index-refresh` | `systems/distribution/responsibilities/agent-ecosystem-index.prose.md`, `systems/distribution/workflows/agent-index-refresh.prose.md`, `systems/distribution/services/platform-crawler.prose.md`, `systems/distribution/services/activity-scorer.prose.md`, `systems/distribution/services/index-renderer.prose.md` | Public index refresh with external reads, scoring, citations, and per-node model-routing intent | Separate crawl targets, crawl batches, scored index, and report. Keep model routing as runtime metadata rather than source-level provider identity. |
| `merged-pr-fit-review-lite` | `systems/product-engineering/responsibilities/merged-pr-fit-review.prose.md`, `systems/product-engineering/services/pr-fit-auditor.prose.md` | Prior-run memory reuse over merged PR batches with review findings, memory delta, and rollup summary | Split audit findings, memory delta, and summary into explicit outputs. Keep memory persistence gated on graph success. |

## Highest-Value Source Syncs

Phase 07.2 should start with these because they most directly pressure the
React-like runtime:

1. `program-designer`
   - It is the closest match to the `lead-program-designer` example.
   - It should show selective recompute when brand context changes.
   - It can be updated without touching external IO adapters.

2. `stargazer-intake`
   - It is the clearest memory/backpressure loop in the company repo.
   - It should prove memory deltas and idempotent replay against real company
     responsibilities.
   - Existing dirty `.prose/` runtime artifacts suggest active use, so sync
     source carefully and do not rewrite run history in the same slice.

3. `openprose-release` / `release-on-demand`
   - It is the most important human-gated company workflow.
   - It should align with the example's pure decision node before any gated
     publish/deliver work.

4. `customer-repo-scaffolder`
   - It is the best mutation-safety showcase.
   - It should preserve a scratch preview artifact before committed repo
     writes.

## Lower-Priority Syncs

- `agent-ecosystem-index` and `opportunity-discovery` are valuable but touch
  broader distribution concepts and external-read posture.
- `merged-pr-fit-review` is important, but memory/review semantics overlap with
  `stargazer-intake`; update it after the memory-delta pattern is stable in one
  company workflow.
- `company-signal-brief` should remain an example unless a real shared company
  responsibility starts needing the same contract.

## Test Backpressure For 07.2

When source sync begins, each slice should:

- run the customer repo validation script from `customers/prose-openprose`
- run `bun run prose compile <changed customer path>` from the OSS package when
  possible
- run targeted `publish-check` for the customer package if source metadata is
  affected
- run relevant north-star example tests if the company change reflects an
  example pattern
- commit and push the customer repo if customer source changes are made
- update this OSS RFC signpost with paths changed, checks run, and next source
  sync target

## Do Not Promote Yet

- Do not commit generated `.prose/runs/` artifacts as golden evidence until
  Phase 07.3.
- Do not touch dirty customer runtime files while syncing source contracts.
- Do not reintroduce flat provider vocabulary in company source. Use graph VM,
  runtime profile, model provider, and node session only where those concepts
  are actually needed.
