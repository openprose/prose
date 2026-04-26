# 031e Opportunity Discovery Source Sync

Date: 2026-04-26
Branch: `rfc/reactive-openprose`
Customer branch: `build/reactive-openprose-company`
Customer commit: `e37384c docs: align opportunity discovery with north star examples`
Commit target: `docs: record opportunity discovery source sync`

## What Changed

In `customers/prose-openprose`, aligned the distribution opportunity loop with
the `opportunity-discovery-lite` north-star example:

- Added `platform_scan_window` as a source-linked scan artifact.
- Added `opportunity_classifications` as the explicit classifier output.
- Added `opportunity_dedupe_report` as the fan-in/dedup artifact.
- Renamed the old broad `summary` output to `opportunity_summary`.
- Kept `opportunities` as the downstream engagement queue input, but now it is
  derived from the dedupe report and filtered by `quality_threshold`.
- Replaced inline array/object syntax in the execution block with named search
  terms, categories, urgency tiers, and structured returns.
- Updated `opportunity-classifier` to accept `urgency_tiers` and emit
  `quality_reasoning` and `urgency`.
- Updated `engagement-weekly` to consume `discovery.opportunities`, return the
  delivery receipt, approval, and opportunity summary, and keep the human-gated
  delivery surface explicit.
- Updated evals for opportunity discovery and engagement weekly to assert the
  new artifact shape.

Existing dirty `.prose/` stargazer runtime artifacts in the customer repo were
left untouched and uncommitted.

## Why It Matters

Opportunity discovery is the best company-source version of a fan-out/fan-in
market-sensing graph. The updated source shows each intermediate artifact the
runtime needs for traceability: what was scanned, how it was classified, what
was deduplicated, what survived thresholding, and what summary fed the
engagement queue. This makes the workflow much more legible than a single
`opportunities` array appearing out of a command wall.

## Tests Run

From `customers/prose-openprose`:

- `bun /Users/sl/code/openprose/platform/external/prose/bin/prose.ts compile systems/distribution/responsibilities/opportunity-discovery.prose.md --no-pretty`
- `bun /Users/sl/code/openprose/platform/external/prose/bin/prose.ts compile systems/distribution/workflows/engagement-weekly.prose.md --no-pretty`
- `SLACK_WEBHOOK_URL=1 SLACK_BOT_TOKEN=1 REVIEW_CHANNEL=1 bun /Users/sl/code/openprose/platform/external/prose/bin/prose.ts preflight systems/distribution/workflows/engagement-weekly.prose.md`
- `bun /Users/sl/code/openprose/platform/external/prose/bin/prose.ts lint systems/distribution`
- `bun /Users/sl/code/openprose/platform/external/prose/bin/prose.ts publish-check .`
- `git diff --check`

From `platform/external/prose`:

- `bun test test/north-star-scripted-scenarios.test.ts test/examples-tour.test.ts`

## Test Results

- opportunity-discovery compile: pass
- engagement-weekly compile: pass
- engagement-weekly preflight: pass
- touched distribution files: 0 diagnostics
- customer publish-check: pass, 99 components, no compile errors
- diff check: pass
- north-star scripted/example tests: 8 pass

## Tests Not Run

- No live platform scan or live engagement drafting was run for this slice. The
  source contract, preflight, publish-check, and north-star fixture tests cover
  the structural runtime shape.

## Remaining Global Lint Warnings

- distribution `agent-ecosystem-index`: 3 unparsed execution bindings
- distribution `agents-site-analytics`: 1 unparsed execution binding

## Next Slice

- Continue Phase 07.2 with `agent-ecosystem-index`, because it maps to the
  `agent-ecosystem-index-refresh` north-star example and contains most of the
  remaining distribution lint debt.

## Design Learnings

- Keeping a compatibility-shaped final output can be useful when it remains a
  real graph artifact. Here, `opportunities` stays useful, but it is no longer
  the whole story.
- Engagement workflows should carry summary/provenance forward from discovery
  rather than reducing the upstream run to only draftable rows.
- Named source artifacts make external-read workflows feel much closer to a
  dataflow program: scan, classify, dedupe, threshold, summarize.
