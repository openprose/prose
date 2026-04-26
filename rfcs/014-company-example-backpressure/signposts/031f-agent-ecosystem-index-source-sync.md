# 031f Agent Ecosystem Index Source Sync

Date: 2026-04-26
Branch: `rfc/reactive-openprose`
Customer branch: `build/reactive-openprose-company`
Customer commit: `97fb718 docs: align agent ecosystem index with north star examples`
Commit target: `docs: record agent ecosystem index source sync`

## What Changed

In `customers/prose-openprose`, aligned the agent ecosystem index refresh with
the `agent-ecosystem-index-refresh` north-star example:

- Added `agent_crawl_targets` as the normalized target-building artifact.
- Added `agent_crawl_batches` as the fetched evidence artifact.
- Renamed the scored map to `agent_ecosystem_index`.
- Renamed the rendered bundle to `agent_index_artifacts`.
- Kept `index` and `top` as publishable delivery artifacts derived from the
  rendered bundle.
- Removed the inline `outputs:` block that was confusing the execution parser.
- Updated `agent-index-refresh` to return `published_status` and the scored
  index instead of passing through the responsibility result blob.
- Updated evals to assert the new traceable artifacts.

Existing dirty `.prose/` stargazer runtime artifacts in the customer repo were
left untouched and uncommitted.

## Why It Matters

This is the reference company's public external-read index. The updated source
now shows the runtime's real graph: target selection, batched crawl evidence,
scoring, rendering, and publish. That shape is much easier for the hosted
platform to visualize, retry, cache, and audit than a single opaque artifact
bundle.

## Tests Run

From `customers/prose-openprose`:

- `bun /Users/sl/code/openprose/platform/external/prose/bin/prose.ts compile systems/distribution/responsibilities/agent-ecosystem-index.prose.md --no-pretty`
- `bun /Users/sl/code/openprose/platform/external/prose/bin/prose.ts compile systems/distribution/workflows/agent-index-refresh.prose.md --no-pretty`
- `DEPLOY_DIR=/tmp/openprose-agent-index bun /Users/sl/code/openprose/platform/external/prose/bin/prose.ts preflight systems/distribution/workflows/agent-index-refresh.prose.md`
- `bun /Users/sl/code/openprose/platform/external/prose/bin/prose.ts lint systems/distribution`
- `bun /Users/sl/code/openprose/platform/external/prose/bin/prose.ts publish-check .`
- `git diff --check`

From `platform/external/prose`:

- `bun test test/north-star-scripted-scenarios.test.ts test/examples-tour.test.ts`

## Test Results

- agent-ecosystem-index compile: pass
- agent-index-refresh compile: pass
- agent-index-refresh preflight: pass
- touched distribution files: 0 diagnostics
- customer publish-check: pass, 99 components, no compile errors
- diff check: pass
- north-star scripted/example tests: 8 pass

## Tests Not Run

- No live crawl or filesystem publish was executed; this slice verified source,
  dependency, and runtime contract structure.

## Remaining Global Lint Warnings

- distribution `agents-site-analytics`: 1 unparsed execution binding

## Next Slice

- Clean `agents-site-analytics`, the final known global lint warning, then run
  the full customer validation path again.

## Design Learnings

- Public index workflows benefit from preserving both machine-readable scored
  data and publishable text artifacts.
- The workflow should own delivery receipts; the responsibility should own the
  data and rendered content.
- Avoid source-level formatting directives that look like nested execution
  bindings. Named artifacts are clearer for both humans and the compiler.
