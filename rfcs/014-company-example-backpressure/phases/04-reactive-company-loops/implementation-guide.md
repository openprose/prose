# Phase 04 Implementation Guide

Phase 04 makes OpenProse feel stateful rather than chat-like.

## 04.1 `stargazer-intake-lite`

Implementation:

- Add batch reader, prioritizer, classifier, memory writer, and digest writer.
- Treat high-water mark and cumulative registry as memory artifacts.
- Commit memory only after graph success.

Tests:

- Duplicate stars are skipped.
- Failed downstream node does not advance memory.
- Same input plus same memory produces no duplicate actions.
- Digest excludes private enrichment details.

Commit/signpost:

- `feat: add stargazer intake example`
- `signposts/020-stargazer-intake-lite.md`

## 04.2 `opportunity-discovery-lite`

Implementation:

- Add scan reader, classifier, deduper, and summary writer.
- Use source refs in every surfaced opportunity.

Tests:

- Old opportunities rejected.
- Duplicate cross-posts collapse.
- Highest-reach source wins.
- Missing source refs fail eval.

Commit/signpost:

- `feat: add opportunity discovery example`
- `signposts/021-opportunity-discovery-lite.md`

## 04.3 Reactive Loop Measurements

Implementation:

- Report memory artifact count, high-water movement, duplicate suppression,
  stale reasons, and recompute savings.

Tests:

- Run measurement script.
- Run confidence matrix if CLI/runtime contracts changed.
- Run `bun run typecheck`.

Commit/signpost:

- `test: measure reactive company loops`
- `signposts/022-reactive-loop-measurements.md`
