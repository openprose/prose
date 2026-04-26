# 031 Company Source Sync

Date: 2026-04-26
Branch: `rfc/reactive-openprose`
Customer branch: `build/reactive-openprose-company`
Customer commit: `e7e7b06 docs: align revenue programs with north star examples`
Commit target: `docs: record company source sync`

## What Changed

In `customers/prose-openprose`, aligned the revenue `program-designer` flow
with the stabilized `lead-program-designer` north-star example:

- Renamed the accepted input to `enriched_profile` so the downstream graph is
  explicit about using the materialized lead-enrichment output.
- Renamed `qualification_score` to `lead_qualification_score` through:
  - `systems/revenue/responsibilities/program-designer.prose.md`
  - `systems/revenue/services/qualification-scorer.prose.md`
  - `systems/revenue/evals/program-designer.eval.prose.md`
  - `systems/revenue/workflows/gtm-pipeline.prose.md`
  - `systems/revenue/responsibilities/customer-repo-scaffolder.prose.md`
- Added `lead_program_plan: Markdown<SaveGrowProgramPlan>` as a compact
  review-gate artifact tying qualification, Save/Grow programs, pitch angle,
  and URL slug together.
- Updated `gtm-pipeline` so the human gate reviews `programs.lead_program_plan`
  while repo scaffolding still receives the structured Save/Grow objects.
- Moved nested criteria/guidance lists out of call bindings in
  `program-designer` so the revenue directory lints cleanly.
- Replaced stale "Prose v2" wording in the touched revenue source with
  `.prose.md`.
- Updated `prose.lock` in the customer repo to point at the current Prose commit
  used by validation: `f133ecf866ce6ddb25a3a0807d8e168b0220beb4`.

Existing dirty `.prose/` stargazer runtime artifacts in the customer repo were
left untouched and uncommitted.

## Why It Matters

This is the first real Phase 07 promotion from example backpressure into the
reference company. The revenue workflow now has a durable plan artifact for the
human gate and typed intermediate outputs for downstream scaffolding. That is
the company-scale version of the React-like pattern: update the brand context,
and the program-design artifact can change without pretending enrichment or
repo mutation must also be replayed.

## Tests Run

From `customers/prose-openprose`:

- `bun /Users/sl/code/openprose/platform/external/prose/bin/prose.ts compile systems/revenue/responsibilities/program-designer.prose.md`
- `bun /Users/sl/code/openprose/platform/external/prose/bin/prose.ts compile systems/revenue/workflows/gtm-pipeline.prose.md`
- `bun /Users/sl/code/openprose/platform/external/prose/bin/prose.ts lint systems/revenue`
- `bun /Users/sl/code/openprose/platform/external/prose/bin/prose.ts publish-check .`
- `EXA_API_KEY=1 REVIEW_CHANNEL="#review" bun /Users/sl/code/openprose/platform/external/prose/bin/prose.ts preflight systems/revenue/workflows/gtm-pipeline.prose.md`
- `git diff --check`

From `platform/external/prose`:

- `bun test test/lead-program-designer-example.test.ts test/examples-tour.test.ts`

## Test Results

- program-designer compile: pass
- gtm-pipeline compile: pass
- revenue lint: pass, 0 diagnostics across revenue contracts and evals
- customer publish-check: pass, 99 components, no compile errors
- gtm-pipeline preflight: pass
- diff check: pass
- north-star lead/example tests: 10 pass

## Tests Not Run

- Full customer validation did not complete. It stops at global `systems/` lint
  warnings in pre-existing non-revenue files:
  - distribution `agent-ecosystem-index`
  - distribution `agents-site-analytics`
  - distribution `opportunity-discovery`
  - distribution `stargazer-intake`
  - product-engineering `merged-pr-fit-review`
  - product-engineering `openprose-release`
- This slice removed revenue warnings rather than broadening into unrelated
  systems.

## Next Slice

- Continue Phase 07.2 with `stargazer-intake`, because it is the clearest
  memory/backpressure loop in the reference company and the next best match to
  the north-star example ladder.

## Design Learnings

- The customer repo is already close to the right shape, but several workflows
  still hide important intermediate outcomes inside broad return objects.
- The safest company sync pattern is to add one durable artifact at the gate
  boundary while preserving structured objects for downstream source.
- The validation script is now useful as a warning debt detector, but it is too
  broad for a narrow source-sync slice until the older non-revenue lint warnings
  are cleaned up.
