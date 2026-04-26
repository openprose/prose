# 031d Merged PR Review Source Sync

Date: 2026-04-26
Branch: `rfc/reactive-openprose`
Customer branch: `build/reactive-openprose-company`
Customer commit: `e656202 docs: align merged pr review with north star examples`
Commit target: `docs: record merged pr review source sync`

## What Changed

In `customers/prose-openprose`, aligned
`systems/product-engineering/responsibilities/merged-pr-fit-review.prose.md`
with the `merged-pr-fit-review-lite` north-star example:

- Renamed the broad `reviews` output to `pr_review_findings`.
- Renamed `skipped` to `skipped_pr_reviews` so skipped work is an explicit
  artifact rather than a generic collection.
- Added `pr_review_memory_delta` as the proposed memory write for verdicts and
  the new review watermark.
- Renamed `summary` to `pr_fit_summary`.
- Replaced the inline `project-memory ingest` object with a structured
  memory-delta synthesis step.
- Updated `merged-pr-fit-review.eval` to assert the new artifact names,
  memory-delta shape, duplicate-key protection, and summary presence.

Existing dirty `.prose/` stargazer runtime artifacts in the customer repo were
left untouched and uncommitted.

## Why It Matters

This is the reference company's self-improvement loop. The old contract hid the
interesting part in one command-wall memory write; the updated contract exposes
findings, skipped work, memory delta, and rollup summary as separate run
artifacts. That gives the runtime a concrete basis for prior-run reuse, changed
spirit-anchor invalidation, audit UI, and post-graph memory persistence.

## Tests Run

From `customers/prose-openprose`:

- `bun /Users/sl/code/openprose/platform/external/prose/bin/prose.ts compile systems/product-engineering/responsibilities/merged-pr-fit-review.prose.md --no-pretty`
- `bun /Users/sl/code/openprose/platform/external/prose/bin/prose.ts lint systems/product-engineering`
- `GH_CLI_AUTH=1 bun /Users/sl/code/openprose/platform/external/prose/bin/prose.ts preflight systems/product-engineering/responsibilities/merged-pr-fit-review.prose.md`
- `bun /Users/sl/code/openprose/platform/external/prose/bin/prose.ts publish-check .`
- `bun /Users/sl/code/openprose/platform/external/prose/bin/prose.ts lint systems`
- `git diff --check`

From `platform/external/prose`:

- `bun test test/north-star-scripted-scenarios.test.ts test/examples-tour.test.ts`

## Test Results

- merged-pr-fit-review compile: pass
- product-engineering lint: pass, 0 diagnostics across product-engineering
- merged-pr-fit-review preflight: pass
- customer publish-check: pass, 99 components, no compile errors
- diff check: pass
- north-star scripted/example tests: 8 pass
- global systems lint: still fails only on remaining distribution warnings

## Tests Not Run

- No live GitHub/agent execution was run for this slice. The source contract,
  preflight, publish-check, and north-star fixture tests covered the structural
  backpressure.

## Remaining Global Lint Warnings

- distribution `agent-ecosystem-index`: 3 unparsed execution bindings
- distribution `agents-site-analytics`: 1 unparsed execution binding
- distribution `opportunity-discovery`: 9 unparsed execution bindings

## Next Slice

- Continue Phase 07.2 with `opportunity-discovery`, because it is the largest
  remaining distribution warning cluster and maps directly to the
  `opportunity-discovery-lite` north-star fan-out/fan-in example.

## Design Learnings

- Review systems benefit from the same memory-delta pattern as intake systems:
  decide what should be remembered, expose it as a run artifact, and let the
  runtime commit it after the graph succeeds.
- Output names should describe their role in the graph, not just their data
  shape. `pr_review_findings`, `pr_review_memory_delta`, and `pr_fit_summary`
  tell future agents what they can safely reuse.
- Lint-warning cleanup is most valuable when it also removes hidden effects and
  makes the company source closer to the north-star examples.
