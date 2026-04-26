# Phase 07: Reference Company Sync

Goal: feed the example-suite learnings back into `customers/prose-openprose`
without making the customer repo itself the runtime test harness.

## 07.1 Crosswalk Examples To Company Programs

Build:

- Add a crosswalk document mapping each north-star example to the source company
  responsibility/workflow it represents.
- Identify which company contracts should be updated because the examples
  clarified the ideal runtime shape.

Tests:

- Documentation-only slice: run no code unless crosswalk generation is
  automated.
- Run `git diff --check`.

Commit:

- Commit as `docs: map examples to reference company programs`.

Signpost:

- Add `signposts/030-company-crosswalk.md`.

## 07.2 Update Company Source Patterns

Build:

- Apply narrow source improvements to `customers/prose-openprose` only after
  the OSS examples prove the pattern.
- Prefer updates that make company programs cleaner:
  - explicit output contracts
  - clearer memory artifacts
  - better eval assertions
  - clearer effect gates
  - removal of stale runtime vocabulary

Tests:

- Run the company validation script.
- Run OSS package checks affected by the customer package.
- Run targeted compile/publish checks for `customers/prose-openprose`.

Commit:

- Commit in the relevant repo as `docs: align company programs with north star examples` or a narrower message.

Signpost:

- Add `signposts/031-company-source-sync.md` in the OSS RFC and, if the
  customer repo has its own planning area, mirror the summary there.

## 07.3 Promote Golden Runs Carefully

Build:

- Promote only the most useful successful runs into committed fixtures or
  records.
- Keep generated run state out of the source navigation path unless it is
  intentionally part of replay evidence.

Tests:

- Golden run replay tests compare semantic properties, not exact prose.
- Company publish-check still passes.
- Runtime confidence still passes.

Commit:

- Commit as `test: add golden runs for company examples`.

Signpost:

- Add `signposts/032-golden-run-promotion.md`.
