# 019 Simple Example Measurements

Date: 2026-04-26
Branch: `rfc/reactive-openprose`
Commit target: `test: measure simple company examples`

## What Changed

- Reworked `scripts/measure-examples.ts` around the Phase 03 north-star
  examples instead of the deleted early tour files.
- Measurements now include:
  - package health for examples, std, co, and the reference company package
  - `company_signal_brief` compile/runtime/eval/session/trace stats
  - `lead_program_designer` graph nodes, first-run sessions, eval status,
    brand-change executed/reused nodes, brand-change session count, and
    profile-change executed/reused nodes
  - release-gate blocked nodes
  - baseline comparison fields for avoided brand-change recomputes and sessions
- Regenerated:
  - `docs/measurements/latest.json`
  - `docs/measurements/latest.md`
- Added `test/measure-examples.test.ts` to assert generated measurement JSON
  contains the simple north-star examples and recompute savings.

## Measurement Evidence

- `company_signal_brief`
  - scripted sessions: 1
  - eval status: passed
- `lead_program_designer`
  - first-run sessions: 3
  - brand-change sessions: 1
  - brand-change reused nodes: `lead-profile-normalizer`,
    `lead-qualification-scorer`
  - brand-change saved sessions: 2

## Testing

- `bun run measure:examples`
- `bun test test/measure-examples.test.ts`
- `bun run typecheck`

Result so far: measurement generation passes.

## Next Slice

Phase 03 is complete. Move to `04-reactive-company-loops`: add memory,
idempotence, replay, and high-water mark pressure on top of the proven
Pi-first graph runtime.
