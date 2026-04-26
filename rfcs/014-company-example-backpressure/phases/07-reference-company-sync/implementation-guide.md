# Phase 07 Implementation Guide

Phase 07 updates the reference company only after OSS examples prove the
pattern.

Current status:

- 07.1 Crosswalk: complete.
- 07.2 Company Source Sync: complete.
- 07.3 Golden Runs: complete as semantic goldens.

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

Completed source-sync signposts:

- `031-company-source-sync.md`
- `031b-stargazer-intake-source-sync.md`
- `031c-release-source-sync.md`
- `031d-merged-pr-review-source-sync.md`
- `031e-opportunity-discovery-source-sync.md`
- `031f-agent-ecosystem-index-source-sync.md`
- `031g-agents-site-analytics-source-sync.md`
- `031h-customer-repo-scaffolder-source-sync.md`

Closeout validation:

- full customer `systems` lint passes with 0 diagnostics
- customer publish-check passes with 99 components
- OSS suite passes with 240 pass and 2 live-smoke skips
- customer `scripts/validate-openprose-local.sh` passes after switching the
  runtime smoke from `prose materialize` to `prose run`

## 07.3 Golden Runs

Implementation:

- Promote only useful successful runs into replay fixtures.
- Keep generated run state out of the main source navigation path.
- Treat dirty `.prose/` runtime files as non-golden unless they were produced
  after the current source contracts and are intentionally curated.
- Store golden evidence as small semantic snapshots first; promote full run
  directories only when they are necessary for replay debugging.

Tests:

- Golden replay tests compare semantic properties, not exact prose.
- Company publish-check.
- Runtime confidence.

Commit/signpost:

- `test: add golden company example runs`
- `signposts/032-golden-run-promotion.md`

Completed implementation:

- Added `customers/prose-openprose/goldens/semantic/company-package.snapshot.json`.
- Added `customers/prose-openprose/scripts/validate-semantic-goldens.ts`.
- The snapshot records package hashes, selected component contracts/effects,
  publish-check status, and a deterministic `--graph-vm pi` company-map run.
- The customer validation script now runs the semantic golden check.
- Whole `.prose/runs/` directories remain unpromoted unless a future replay
  debugging slice needs them.
