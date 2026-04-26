# 031h Customer Repo Scaffolder Source Sync

Date: 2026-04-26
Branch: `rfc/reactive-openprose`
Customer branch: `build/reactive-openprose-company`
Customer commit: `b312178 docs: align customer repo scaffolder with preview artifacts`
Commit target: `docs: record customer repo scaffolder source sync`

## What Changed

In `customers/prose-openprose`, aligned the revenue customer-repo scaffolder
with the `customer-repo-scaffold-preview` north-star example:

- Added `customer_repo_plan` as the pure proposed file tree artifact.
- Added `customer_repo_preview` as the scratch preview with file paths and
  content hashes.
- Made committed `directory` writes occur after plan and preview
  materialization.
- Updated `gtm-pipeline` to return `customer_repo_plan`,
  `customer_repo_preview`, committed `customer_repo`, and `lead_plan`.
- Updated customer-repo-scaffolder and GTM evals to assert preview-before-write
  semantics.

Existing dirty `.prose/` stargazer runtime artifacts in the customer repo were
left untouched and uncommitted.

## Why It Matters

This completes the high-value source sync list from the crosswalk. The real GTM
mutation path now mirrors the OSS example: pure planning first, inspectable
scratch preview second, committed repo mutation last. That is the exact pattern
the hosted runtime needs for enterprise audit, human review, retry, and safe
mutation.

## Tests Run

From `customers/prose-openprose`:

- `bun /Users/sl/code/openprose/platform/external/prose/bin/prose.ts compile systems/revenue/responsibilities/customer-repo-scaffolder.prose.md --no-pretty`
- `bun /Users/sl/code/openprose/platform/external/prose/bin/prose.ts compile systems/revenue/workflows/gtm-pipeline.prose.md --no-pretty`
- `EXA_API_KEY=1 REVIEW_CHANNEL=1 bun /Users/sl/code/openprose/platform/external/prose/bin/prose.ts preflight systems/revenue/workflows/gtm-pipeline.prose.md`
- `bun /Users/sl/code/openprose/platform/external/prose/bin/prose.ts lint systems/revenue`
- `bun /Users/sl/code/openprose/platform/external/prose/bin/prose.ts lint systems`
- `bun /Users/sl/code/openprose/platform/external/prose/bin/prose.ts publish-check .`
- `git diff --check`

From `platform/external/prose`:

- `bun test test/customer-repo-scaffold-preview-example.test.ts test/examples-tour.test.ts`

## Test Results

- customer-repo-scaffolder compile: pass
- gtm-pipeline compile: pass
- gtm-pipeline preflight: pass
- revenue lint: pass, 0 diagnostics
- full customer `systems` lint: pass, 0 diagnostics
- customer publish-check: pass, 99 components, no compile errors
- diff check: pass
- scaffold-preview/example tests: 11 pass

## Remaining Global Lint Warnings

- None in `customers/prose-openprose/systems`.

## Tests Not Run

- No live Exa enrichment, live human gate, or actual customer-repo scaffold
  mutation was run in this slice. The structural checks and OSS scratch-preview
  tests covered the mutation-safety pattern.

## Next Slice

- Close out Phase 07.2 in the planning docs, then move to Phase 07.3 only if
  the intended golden evidence can be promoted without committing noisy runtime
  state.

## Design Learnings

- Mutating company workflows should always expose the proposed mutation surface
  before the write happens.
- Scratch previews are more useful when they include hashes; the platform can
  diff and approve the mutation without rendering every file in full.
- The GTM pipeline is now a clean exemplar of the broader OpenProse story:
  typed lead artifacts, human-gated program plans, previewed repo mutation, and
  durable lead records.
