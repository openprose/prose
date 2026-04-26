# 021 Opportunity Discovery Lite

Date: 2026-04-26
Branch: `rfc/reactive-openprose`
Commit target: `feat: add opportunity discovery example`

## What Changed

- Reworked `opportunity-discovery-lite` into a four-node source-aware
  reactive loop:
  - `platform-scan-reader`
  - `opportunity-classifier`
  - `opportunity-deduplicator`
  - `opportunity-summary-writer`
- Added `platform_scan_window` as a first-class graph artifact so freshness,
  missing provenance, and low-evidence filtering happen before classification.
- Renamed the dedupe and summary nodes to make their roles explicit.
- Expanded the duplicate-crosspost fixture with:
  - an old high-reach row that must be rejected by recency
  - a fresh row with no URL that must be rejected by provenance
- Added `test/opportunity-discovery-lite-example.test.ts` covering:
  - scan window filtering
  - duplicate cross-post clustering
  - highest-reach fresh source selection
  - source-linked quality reasoning
  - helpful-answer framing before promotion
  - brand-context recompute that reuses the scan reader
  - seeded-bad eval rejection
- Updated scripted north-star scenarios and package IR fixtures for the new
  graph shape.

## Source And Dedupe Evidence

- Accepted source rows:
  - `https://news.ycombinator.com/item?id=1003`
  - `https://x.example/status/1003`
- Rejected source rows:
  - old Reddit row: `older than 7 days`
  - URL-less Mastodon row: `missing url provenance`
- Deduped winner:
  - `https://x.example/status/1003`
  - reason: highest reach among fresh duplicates

## Recompute Evidence

Changing only `brand_context` with `targetOutputs = ["opportunity_summary"]`
executes:

- `opportunity-classifier`
- `opportunity-deduplicator`
- `opportunity-summary-writer`

It reuses `platform-scan-reader`, which means the source freshness window is a
stable upstream materialization while downstream reasoning can rerender.

## Why It Matters

This example shows OpenProse as a React-like outcome framework for go-to-market
loops: raw platform evidence becomes a reusable scan artifact, brand context
rerenders the reasoning layer, and public recommendations carry source
provenance instead of collapsing into an untraceable suggestion.

## Tests Run

- `bun test test/opportunity-discovery-lite-example.test.ts test/north-star-scripted-scenarios.test.ts test/examples-tour.test.ts`
- `bun run prose compile examples --no-pretty`
- `bun run prose publish-check examples --strict`
- `bun test test/package-ir.test.ts test/opportunity-discovery-lite-example.test.ts test/examples-tour.test.ts test/north-star-scripted-scenarios.test.ts`
- `bun run typecheck`
- `bun test`

## Tests Not Run

- `bun run measure:examples`; Phase 04.3 owns the measurement fields for the
  newly expanded reactive loops.

## Next Slice

Phase 04.3 should extend measurements with memory artifact count, duplicate
suppression count, high-water mark result, targeted recompute saved nodes, and
stale reason summaries for the reactive company loops.

## Design Learnings

- The scan window is the right intermediate artifact: it gives the graph a
  stable, inspectable boundary between raw platform rows and brand-sensitive
  reasoning.
- Brand-sensitive recompute is more compelling when source filtering is
  factored upstream. It makes the local runtime feel less like a prompt chain
  and more like a component tree of accepted outcomes.
