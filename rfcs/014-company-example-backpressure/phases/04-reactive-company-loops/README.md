# Phase 04: Reactive Company Loops

Goal: add examples that pressure memory, idempotence, deduplication, and
reactive recompute.

## 04.1 Implement `stargazer-intake-lite`

Build:

- Add a graph based on `stargazer-intake`:
  - `stargazer-batch-reader`
  - `stargazer-prioritizer`
  - `stargazer-profile-classifier`
  - `stargazer-memory-writer`
  - `stargazer-digest-writer`
- Use caller-provided GitHub star fixtures first.
- Model high-water mark and cumulative registry as run/memory artifacts.

Tests:

- Duplicate stars are skipped.
- High-water mark advances only after success.
- Deferred enrichment records still carry GitHub metadata.
- Digest excludes sensitive/private enrichment fields.
- Re-running with the same memory produces no duplicate actions.
- Run `bun run typecheck`.
- Run focused tests and full `bun test`.

Commit:

- Commit as `feat: add stargazer intake example`.

Signpost:

- Add `signposts/020-stargazer-intake-lite.md` with idempotence evidence.

## 04.2 Implement `opportunity-discovery-lite`

Build:

- Add a graph based on `opportunity-discovery`:
  - `platform-scan-reader`
  - `opportunity-classifier`
  - `opportunity-deduplicator`
  - `opportunity-summary-writer`
- Use caller-provided platform scan fixtures.

Tests:

- Old results older than seven days are rejected.
- Duplicate cross-posts collapse to one opportunity.
- Highest-reach source wins.
- Every surfaced opportunity includes quality reasoning.
- Suggested angle leads with helpful answer, not promotion.
- Run `bun run typecheck`.
- Run focused tests and full `bun test`.

Commit:

- Commit as `feat: add opportunity discovery example`.

Signpost:

- Add `signposts/021-opportunity-discovery-lite.md` with seeded-bad failures.

## 04.3 Add Reactive Loop Measurements

Build:

- Extend measurement output with:
  - memory artifact count
  - duplicate suppression count
  - high-water mark result
  - targeted recompute saved nodes
  - stale reason summaries

Tests:

- Run `bun run measure:examples`.
- Run `bun run confidence:runtime` if runtime CLI contracts changed.
- Run `bun run typecheck`.

Commit:

- Commit as `test: measure reactive company loops`.

Signpost:

- Add `signposts/022-reactive-loop-measurements.md`.
