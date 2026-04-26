# 020 Stargazer Intake Lite

Date: 2026-04-26
Branch: `rfc/reactive-openprose`
Commit target: `feat: add stargazer intake example`

## What Changed

- Reworked `stargazer-intake-lite` into a five-node reactive company loop:
  - `stargazer-batch-reader`
  - `stargazer-prioritizer`
  - `stargazer-profile-classifier`
  - `stargazer-memory-writer`
  - `stargazer-digest-writer`
- Split the old ranking/enrichment flow into explicit batch delta,
  prioritization, profile classification, memory proposal, and public digest
  artifacts.
- Added `test/stargazer-intake-lite-example.test.ts` covering:
  - duplicate and high-water filtering
  - GitHub metadata preservation in enrichment records
  - private enrichment fields excluded from the public digest
  - downstream failure prevents the memory node from becoming current
  - unchanged replay returns the accepted current graph without opening Pi
- Updated scripted north-star scenarios and package IR fixtures for the new
  graph shape.

## Idempotence Evidence

- The duplicate/high-water fixture only accepts `ops-builder`; it skips:
  - `prior-founder` because it already exists in memory
  - the second `ops-builder` row because it is a duplicate API row
- A failed `stargazer-digest-writer` run leaves
  `stargazer-memory-writer.current_run_id` null even though the memory proposal
  node succeeded. The graph has no outputs, so the memory delta is not treated
  as accepted current state.
- A replay with the same input batch and same prior memory returns
  `plan.status = current` and creates no run attempts for the unused run id.

## Why It Matters

This is the first north-star example that behaves like an operating loop rather
than a one-off content generator. It pressures the runtime boundary where an
agent proposes state, the graph decides whether the full outcome is accepted,
and replay avoids duplicate work.

## Tests Run

- `bun test test/stargazer-intake-lite-example.test.ts test/north-star-scripted-scenarios.test.ts test/examples-tour.test.ts`
- `bun run prose compile examples --no-pretty`
- `bun run prose publish-check examples --strict`
- `bun test test/package-ir.test.ts test/stargazer-intake-lite-example.test.ts test/examples-tour.test.ts test/north-star-scripted-scenarios.test.ts`
- `bun run typecheck`
- `bun test`

## Tests Not Run

- `bun run measure:examples`; Phase 04.3 owns reactive loop measurement fields.

## Next Slice

Phase 04.2 should deepen `opportunity-discovery-lite` into a source-aware
reactive loop with recency checks, cross-post dedupe, highest-reach source
selection, and quality reasoning in every surfaced opportunity.

## Design Learnings

- The scheduler correctly runs `stargazer-memory-writer` as soon as the batch
  delta and prior memory are ready; it does not need to wait for independent
  enrichment. The important safety line is graph acceptance, not node ordering.
- Public/private separation belongs in the graph contract and eval pressure:
  enrichment may carry private notes, while the digest must render only safe
  operator-facing content.
