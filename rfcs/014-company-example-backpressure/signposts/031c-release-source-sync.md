# 031c Release Source Sync

Date: 2026-04-26
Branch: `rfc/reactive-openprose`
Customer branch: `build/reactive-openprose-company`
Customer commit: `fec5468 docs: align release workflow with north star examples`
Commit target: `docs: record release source sync`

## What Changed

In `customers/prose-openprose`, aligned the product-engineering release flow
with the stabilized `release-proposal-dry-run` north-star example:

- Added an explicit `release_decision` artifact to `openprose-release`.
- Added a `dry_run` proposal path that returns the proposed version, tag,
  changelog, summary, and decision without mutating the manifest, repo, remote,
  or memory.
- Replaced inline project-memory mutation with a proposed
  `release_memory_delta` that is only valid after a successful publish.
- Updated no-op paths to return the same typed output surface as the publish
  path, so downstream workflows can reason about release state consistently.
- Updated `release-on-demand` to gate on `release_decision`, show
  `release_summary` to the human, and return a `delivery_receipt` instead of a
  loose delivered boolean.
- Updated release evals to assert decision structure, dry-run non-mutation, and
  delivery receipt semantics.

Existing dirty `.prose/` stargazer runtime artifacts in the customer repo were
left untouched and uncommitted.

## Why It Matters

This moves the real company release workflow into the React-like OpenProse
shape: a pure proposal node computes the candidate release, a human gate decides
whether effects are allowed, and the mutating publish path runs only after that
gate. The workflow now has concrete artifacts for replay, diffing, policy
checks, and UI display rather than relying on a blob-shaped command wall.

## Tests Run

From `customers/prose-openprose`:

- `bun /Users/sl/code/openprose/platform/external/prose/bin/prose.ts compile systems/product-engineering/responsibilities/openprose-release.prose.md --no-pretty`
- `bun /Users/sl/code/openprose/platform/external/prose/bin/prose.ts compile systems/product-engineering/workflows/release-on-demand.prose.md --no-pretty`
- `GH_AUTH=1 GH_TOKEN=1 SLACK_WEBHOOK_URL=1 bun /Users/sl/code/openprose/platform/external/prose/bin/prose.ts preflight systems/product-engineering/workflows/release-on-demand.prose.md`
- `bun /Users/sl/code/openprose/platform/external/prose/bin/prose.ts publish-check .`
- `bun /Users/sl/code/openprose/platform/external/prose/bin/prose.ts lint systems/product-engineering`
- `git diff --check`

From `platform/external/prose`:

- `bun test test/release-proposal-dry-run-example.test.ts test/examples-tour.test.ts`

## Test Results

- openprose-release compile: pass
- release-on-demand compile: pass
- release-on-demand preflight: pass
- customer publish-check: pass, 99 components, no compile errors
- diff check: pass
- north-star release/example tests: 13 pass
- product-engineering lint: touched release files now report 0 diagnostics

## Tests Not Run

- Full customer validation still does not complete because global `systems/`
  lint stops on remaining pre-existing warnings outside this slice:
  - distribution `agent-ecosystem-index`
  - distribution `agents-site-analytics`
  - distribution `opportunity-discovery`
  - product-engineering `merged-pr-fit-review`

## Next Slice

- Continue Phase 07.2 with `merged-pr-fit-review`, because it is the last
  remaining product-engineering lint-warning cluster and another strong example
  of policy/eval backpressure over real engineering work.

## Design Learnings

- The release flow gets much easier to test when "what should happen" and
  "perform the effect" are two distinct graph phases.
- Dry-run should be a first-class output contract, not an implied mode hidden in
  prose. The runtime and platform can then show proposal artifacts before any
  mutating session starts.
- Delivery booleans are too weak for enterprise runtime surfaces. A receipt-like
  artifact gives the registry/runtime a better object for audit, retry, and UI.
