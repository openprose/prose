# 031g Agents Site Analytics Source Sync

Date: 2026-04-26
Branch: `rfc/reactive-openprose`
Customer branch: `build/reactive-openprose-company`
Customer commit: `3dd69ed docs: align agents site analytics with graph artifacts`
Commit target: `docs: record agents site analytics source sync`

## What Changed

In `customers/prose-openprose`, cleaned the final global lint-warning cluster
and aligned the agents-site analytics loop with the graph-artifact pattern:

- Renamed `report` to `analytics_report`.
- Renamed `memory_update` to `analytics_memory_delta`.
- Added `analytics_digest` as the channel-safe weekly summary artifact.
- Replaced the inline `project-memory ingest` object with a structured memory
  delta synthesis step.
- Updated `agents-site-weekly` to post `analytics.analytics_digest`, return the
  delivery receipt, and expose `memory_delta` as the proposed memory write.
- Updated responsibility and workflow evals to assert the new artifact names and
  graph-success memory semantics.

Existing dirty `.prose/` stargazer runtime artifacts in the customer repo were
left untouched and uncommitted.

## Why It Matters

This slice gives the reference company a clean validation baseline and makes
its windowed analytics loop match the runtime model: read external logs, build a
structured report, prepare a memory delta, render a safe digest, then let the
workflow deliver the digest. It removes the last hidden memory-ingest object in
the known warning set.

## Tests Run

From `customers/prose-openprose`:

- `bun /Users/sl/code/openprose/platform/external/prose/bin/prose.ts compile systems/distribution/responsibilities/agents-site-analytics.prose.md --no-pretty`
- `bun /Users/sl/code/openprose/platform/external/prose/bin/prose.ts compile systems/distribution/workflows/agents-site-weekly.prose.md --no-pretty`
- `AWS_PROFILE=default SLACK_WEBHOOK_URL=1 bun /Users/sl/code/openprose/platform/external/prose/bin/prose.ts preflight systems/distribution/workflows/agents-site-weekly.prose.md`
- `bun /Users/sl/code/openprose/platform/external/prose/bin/prose.ts lint systems`
- `bun /Users/sl/code/openprose/platform/external/prose/bin/prose.ts publish-check .`
- `git diff --check`

From `platform/external/prose`:

- `bun test`

## Test Results

- agents-site-analytics compile: pass
- agents-site-weekly compile: pass
- agents-site-weekly preflight: pass
- full customer `systems` lint: pass, 0 diagnostics
- customer publish-check: pass, 99 components, no compile errors
- diff check: pass
- OSS test suite: 240 pass, 2 live-smoke skips

## Remaining Global Lint Warnings

- None in `customers/prose-openprose/systems`.

## Tests Not Run

- No live CloudFront/S3 analytics query or live Slack post was executed. The
  source contract, preflight, lint, publish-check, and OSS regression suite
  covered the non-live slice.

## Next Slice

- Run a Phase 07.2 closeout pass across the customer README/crosswalk/signposts
  and decide whether Phase 07.3 should materialize golden run evidence now that
  source contracts are clean.

## Design Learnings

- Windowed analytics has the same ideal shape as stargazer intake: external
  read, structured report, memory delta, digest, then delivery.
- Clean source lint is a meaningful backpressure metric for the reference
  company because parser warnings often reveal hidden effects or blob-shaped
  returns.
- Weekly workflows should return delivery receipts and proposed memory deltas
  separately; that gives the hosted runtime better audit and retry surfaces.
