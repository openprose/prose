# 029 Docs And Diagrams

Date: 2026-04-26
Branch: `rfc/reactive-openprose`
Commit target: `docs: document north star example suite`

## What Changed

- Updated the top-level README, docs index, inference docs, measurement docs,
  release-candidate checklist, examples README, why/when guide, and shipped
  snapshot to reflect the current Pi-backed graph VM model.
- Clarified the runtime boundary:
  - OpenProse is the meta-harness for reactive graphs.
  - Pi is the graph VM and owns one persisted model-backed node session at a
    time.
  - OpenRouter and similar systems are model-provider profiles inside Pi, not
    OpenProse graph VMs.
  - Single-run harnesses can still exist for one-off execution, but they are
    not the multi-node reactive runtime.
- Added a new HTML diagram:
  - `docs/diagrams/confidence-ladder.html`
- Updated the existing diagram navigation and rewrote inference/backpressure
  diagrams away from flat provider language.
- Documented the release-gate relationship among:
  - `measure:examples`
  - `confidence:runtime`
  - `smoke:binary`
  - `smoke:live-pi`

## Why It Matters

Phase 06 made the examples real release backpressure. This slice makes that
visible to a reader without requiring them to reconstruct the architecture from
tests and signposts. The docs now say the same thing the runtime does: the
north-star examples protect typed props, selective recompute, pre-session
effect gates, structured output submission, package metadata, binary packaging,
and opt-in live Pi interop.

## Tests Run

- diagram local link check:
  `for file in docs/diagrams/*.html; do ...; done`
- `bun run prose publish-check examples --strict`
- `bun run typecheck`
- `bun test test/examples-tour.test.ts test/measure-examples.test.ts test/live-pi-smoke.test.ts`
- `bun test`

## Test Results

- diagram local links: pass
- examples strict publish-check: pass
- typecheck: pass
- focused north-star docs/runtime checks: 9 pass
- full deterministic suite: 240 pass, 2 skip

## Tests Not Run

- Successful live Pi smoke. The default smoke remains skipped unless live
  inference is explicitly enabled; prior opt-in attempts reached OpenRouter
  through Pi and returned a billing/credits diagnostic rather than an
  OpenProse runtime failure.

## Next Slice

- Move to Phase 07: sync the reference company package with the stabilized
  north-star runtime patterns and update its signposts as each reference-company
  slice lands.

## Design Learnings

- The most important docs correction was vocabulary. "Provider" is still valid
  for model-provider config, but it obscures the graph runtime when used as the
  top-level execution concept.
- The confidence ladder gives OpenProse a better public explanation than a list
  of commands. It makes the release story visible: deterministic local checks
  are required, live inference is opt-in, and both feed the same runtime
  contract.
