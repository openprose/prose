# Phase 07 Implementation Guide

Phase 07 updates the reference company only after OSS examples prove the
pattern.

## 07.1 Crosswalk

Implementation:

- Map every north-star example to its source company workflow/responsibility.
- Record which contracts should be updated.

Tests:

- Documentation diff check.

Commit/signpost:

- `docs: map examples to company programs`
- `signposts/030-company-crosswalk.md`

## 07.2 Company Source Sync

Implementation:

- Apply narrow updates:
  - explicit output contracts
  - memory artifacts
  - eval assertions
  - effect gates
  - removal of stale provider vocabulary

Tests:

- Company validation.
- Targeted compile/publish checks.
- Relevant OSS checks.

Commit/signpost:

- `docs: align company programs with north star examples`
- `signposts/031-company-source-sync.md`

## 07.3 Golden Runs

Implementation:

- Promote only useful successful runs into replay fixtures.
- Keep generated run state out of the main source navigation path.

Tests:

- Golden replay tests compare semantic properties, not exact prose.
- Company publish-check.
- Runtime confidence.

Commit/signpost:

- `test: add golden company example runs`
- `signposts/032-golden-run-promotion.md`
