# 031i Reference Company Source Sync Closeout

Date: 2026-04-26
Branch: `rfc/reactive-openprose`
Customer branch: `build/reactive-openprose-company`
Customer latest commit: `b312178 docs: align customer repo scaffolder with preview artifacts`
Commit target: `docs: close out reference company source sync`

## What Changed

- Marked Phase 07.1 and 07.2 complete in the Phase 07 docs.
- Listed every completed company source-sync slice.
- Recorded the clean validation baseline:
  - full customer `systems` lint now passes with 0 diagnostics
  - customer publish-check passes with 99 components
  - OSS suite passes with 240 pass and 2 live-smoke skips
- Added explicit Phase 07.3 guidance not to promote pre-sync dirty `.prose/`
  runtime artifacts as golden evidence.

## Why It Matters

The reference company is now aligned with the OSS north-star examples at the
source-contract level. Future agents can start from the Phase 07 docs and see
which company programs have already been updated, which checks define the
baseline, and why golden run promotion should be deliberate rather than a dump
of generated runtime state.

## Tests Run

From `platform/external/prose`:

- `git diff --check`

Validation recorded from the preceding slices:

- `customers/prose-openprose`: `prose lint systems`
- `customers/prose-openprose`: `prose publish-check .`
- `platform/external/prose`: `bun test`

## Test Results

- diff check: pass
- recorded customer lint baseline: pass, 0 diagnostics
- recorded customer publish-check baseline: pass, 99 components
- recorded OSS test baseline: 240 pass, 2 live-smoke skips

## Tests Not Run

- No new runtime or package tests were rerun for this documentation-only
  closeout beyond `git diff --check`.

## Next Slice

- Phase 07.3 should produce curated golden evidence only after fresh runs are
  generated against the updated contracts. Existing dirty `.prose/` runtime
  artifacts in `customers/prose-openprose` should remain uncommitted unless
  intentionally regenerated and reviewed.

## Design Learnings

- Source-contract sync was the right prerequisite for golden runs. Without it,
  committed run evidence would preserve obsolete output names and hidden memory
  writes.
- The reference company now demonstrates the same recurring artifact grammar as
  the OSS examples: plan, decision, delta, preview, digest, delivery receipt,
  and scored index/report.
