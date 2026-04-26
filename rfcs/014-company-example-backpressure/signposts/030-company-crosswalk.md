# 030 Company Crosswalk

Date: 2026-04-26
Branch: `rfc/reactive-openprose`
Commit target: `docs: map examples to reference company programs`

## What Changed

- Added `phases/07-reference-company-sync/crosswalk.md`.
- Mapped every north-star example to the corresponding
  `customers/prose-openprose` responsibility, workflow, service, or shared
  capability.
- Ranked the most valuable source-sync targets for Phase 07.2:
  - `program-designer`
  - `stargazer-intake`
  - `openprose-release` / `release-on-demand`
  - `customer-repo-scaffolder`
- Captured test backpressure expectations for future company source slices.
- Recorded that the customer repo currently has dirty `.prose/` runtime
  artifacts, so this slice intentionally did not touch customer files.

## Why It Matters

The examples now pressure the OSS runtime, but the reference company is where
the pattern has to feel like a real operating system. This crosswalk keeps Phase
07 honest: each company sync should promote a proven runtime pattern back into
source contracts rather than inventing a new style in the customer repo.

## Tests Run

- `git diff --check`

## Tests Not Run

- Code tests were not run because this slice only adds RFC documentation.
- Customer validation was not run because no customer source changed.

## Next Slice

- Phase 07.2 should start with `program-designer`, because it is the closest
  company match to `lead-program-designer` and can demonstrate selective
  recompute without external IO changes.

## Design Learnings

- The company source already contains the right business systems. The likely
  cleanup is not wholesale redesign; it is making intermediate artifacts,
  memory deltas, and gates as explicit as the north-star examples now are.
- Dirty runtime artifacts in the customer repo are a useful warning: source
  sync and golden-run promotion should stay separate slices.
