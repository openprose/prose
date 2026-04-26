# Phase 07: Reference Company Sync

Status: 07.1, 07.2, and 07.3 complete.

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

Completed source syncs:

- `program-designer` / `gtm-pipeline`: named lead-profile, qualification, and
  Save/Grow program artifacts.
- `stargazer-intake` / `stargazer-daily`: batch delta, prioritization,
  enrichment, memory delta, digest, high-water mark, and velocity artifacts.
- `openprose-release` / `release-on-demand`: pure release decision and dry-run
  proposal before gated publish effects.
- `merged-pr-fit-review`: findings, skipped reviews, memory delta, and summary
  artifacts for prior-run reuse.
- `opportunity-discovery` / `engagement-weekly`: scan window,
  classifications, dedupe report, opportunity summary, and delivery receipt.
- `agent-ecosystem-index` / `agent-index-refresh`: crawl targets, crawl
  batches, scored index, rendered artifacts, and publish status.
- `agents-site-analytics` / `agents-site-weekly`: analytics report, memory
  delta, digest, and delivery receipt.
- `customer-repo-scaffolder` / `gtm-pipeline`: repo plan, scratch preview, and
  committed scaffold artifacts.

Closeout checks:

- `customers/prose-openprose`: `prose lint systems` passes with 0 diagnostics.
- `customers/prose-openprose`: `prose publish-check .` passes with 99
  components.
- `platform/external/prose`: `bun test` passes with 240 pass and 2 live-smoke
  skips after the source-sync sequence.
- `customers/prose-openprose`: `scripts/validate-openprose-local.sh` passes
  after updating its runtime smoke from `prose materialize` to `prose run`.

## 07.3 Promote Golden Runs Carefully

Build:

- Promote only the most useful successful runs into committed fixtures or
  records.
- Keep generated run state out of the source navigation path unless it is
  intentionally part of replay evidence.
- Do not promote pre-sync `.prose/` runtime artifacts. Golden evidence must be
  produced after the updated source contracts are in place.
- Prefer curated semantic snapshots over whole run directories unless a full
  run directory is needed to debug replay.

Tests:

- Golden run replay tests compare semantic properties, not exact prose.
- Company publish-check still passes.
- Runtime confidence still passes.

Commit:

- Commit as `test: add golden runs for company examples`.

Signpost:

- Add `signposts/032-golden-run-promotion.md`.

Completed:

- Promoted curated semantic goldens in `customers/prose-openprose` instead of
  whole `.prose/runs/` directories.
- Golden validation now compiles the package, snapshots selected component
  contracts/effects, runs a deterministic `--graph-vm pi` company-map smoke,
  and compares stable JSON semantics.
- Customer validation includes the semantic golden check after compile,
  publish, preflight, run, status, and trace checks.
