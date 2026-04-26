# 031b Stargazer Intake Source Sync

Date: 2026-04-26
Branch: `rfc/reactive-openprose`
Customer branch: `build/reactive-openprose-company`
Customer commit: `bb1657a docs: align stargazer intake with north star examples`
Commit target: `docs: record stargazer source sync`

## What Changed

In `customers/prose-openprose`, aligned the distribution `stargazer-intake`
flow with the stabilized `stargazer-intake-lite` north-star example:

- Replaced the broad `new_stargazers`/`memory_update` shape with explicit
  reactive artifacts:
  - `stargazer_batch_delta`
  - `prioritized_stargazers`
  - `stargazer_enrichment_records`
  - `stargazer_memory_delta`
  - `stargazer_digest`
  - `high_water_mark`
  - `velocity_snapshot`
- Reframed memory as a proposed `stargazer_memory_delta` committed only after
  graph success, matching the OSS effect-gate pattern.
- Rewrote the mutating project-memory ingest block into source-level memory
  delta synthesis, which removed the previous stargazer-intake lint warnings.
- Updated `stargazer-daily` so it posts `intake.stargazer_digest` directly
  rather than relying on inline digest-formatting glue.
- Updated `stargazer-intake.eval` to assert the new delta/enrichment/memory
  artifact names.

Existing dirty `.prose/` stargazer runtime artifacts in the customer repo were
left untouched and uncommitted.

## Why It Matters

This promotes the north-star memory/backpressure pattern into the real company
distribution loop. Stargazer intake now exposes the same durable artifacts the
runtime needs to reason about idempotence, selective replay, memory writes, and
channel-safe delivery. It also pays down warning debt in one of the files that
was blocking the global validation script.

## Tests Run

From `customers/prose-openprose`:

- `bun /Users/sl/code/openprose/platform/external/prose/bin/prose.ts compile systems/distribution/responsibilities/stargazer-intake.prose.md --no-pretty`
- `bun /Users/sl/code/openprose/platform/external/prose/bin/prose.ts compile systems/distribution/workflows/stargazer-daily.prose.md --no-pretty`
- `bun /Users/sl/code/openprose/platform/external/prose/bin/prose.ts lint systems/distribution`
- `bun /Users/sl/code/openprose/platform/external/prose/bin/prose.ts publish-check .`
- `EXA_API_KEY=1 SLACK_WEBHOOK_URL=1 bun /Users/sl/code/openprose/platform/external/prose/bin/prose.ts preflight systems/distribution/workflows/stargazer-daily.prose.md`
- `git diff --check`

From `platform/external/prose`:

- `bun test test/stargazer-intake-lite-example.test.ts test/examples-tour.test.ts`

## Test Results

- stargazer-intake compile: pass
- stargazer-daily compile: pass
- stargazer-intake directory lint: 0 diagnostics for touched files
- customer publish-check: pass, 99 components, no compile errors
- stargazer-daily preflight: pass
- diff check: pass
- north-star stargazer/example tests: 10 pass

## Tests Not Run

- Full customer validation still does not complete because global `systems/`
  lint stops on remaining pre-existing warnings outside this slice:
  - distribution `agent-ecosystem-index`
  - distribution `agents-site-analytics`
  - distribution `opportunity-discovery`
  - product-engineering `merged-pr-fit-review`
  - product-engineering `openprose-release`

## Next Slice

- Continue Phase 07.2 with `openprose-release` / `release-on-demand`, because
  it is the key human-gated company workflow and one of the remaining global
  lint-warning clusters.

## Design Learnings

- The reference company gets cleaner when memory writes are represented as
  explicit deltas instead of hidden project-memory mutation inside the main
  execution block.
- The daily workflow should not reformat sensitive enrichment state. The
  responsibility owns the channel-safe digest; the workflow owns delivery.
- Paying down lint warnings in the same files we are aligning gives each source
  sync real backpressure without ballooning into unrelated cleanup.
