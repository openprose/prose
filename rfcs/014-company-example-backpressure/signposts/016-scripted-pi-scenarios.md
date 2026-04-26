# 016 Scripted Pi Scenarios

Date: 2026-04-26
Branch: `rfc/reactive-openprose`
Commit target: `test: add scripted pi example scenarios`

## What Changed

- Added `test/north-star-scripted-scenarios.test.ts`.
- Every north-star example now has a deterministic scripted Pi scenario.
- The scenarios exercise `openprose_submit_outputs` through
  `submissionsByComponent`; they do not rely on provider output files.
- Effecting examples pass explicit approvals:
  - `writes_memory` for stargazer and merged-PR memory examples
  - `mutates_repo` for customer repo preview
  - `human_gate` and `delivers` for release dry-run
- Added a rejected structured-output scenario to prove OpenProse fails rather
  than silently falling back to output files when the output tool rejects a
  submission.
- Updated the examples README to document the scripted Pi scenario role.

## Testing

- `bun test test/north-star-scripted-scenarios.test.ts`

Result: all scripted scenarios pass.

## Notable Learning

This closes the Phase 01 loop nicely: the north-star examples are no longer
just source contracts plus fixtures. They can all be materialized through the
same structured Pi tool path that live runtime sessions are expected to use.

## Next Slice

Phase 01 is complete. Move to `03-simple-company-graphs`: use the ladder,
fixtures, eval rubrics, and scripted Pi scenarios to implement the first
selective-recompute company graph measurements.
