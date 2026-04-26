# 028 Confidence Matrix Integration

Date: 2026-04-26
Branch: `rfc/reactive-openprose`
Commit target: `test: gate runtime confidence on north star examples`

## What Changed

- Upgraded `scripts/runtime-confidence-matrix.ts` to report
  `report_version: "0.2"`.
- Added confidence steps for:
  - `release-proposal-dry-run` approval gate planning
  - `bun scripts/measure-examples.ts`
  - `bun scripts/live-pi-smoke.ts --tier cheap --skip`
- Taught the confidence runner to support both `prose` and `bun` commands.
- Taught the confidence runner to allow expected nonzero exit codes for
  negative/gating checks, preserving CLI behavior for blocked plans.
- Regenerated:
  - `docs/measurements/runtime-confidence.latest.json`
  - `docs/measurements/runtime-confidence.latest.md`
  - `docs/measurements/latest.json`
  - `docs/measurements/latest.md`
- Fixed the Bun binary build so `dist/package.json` is copied beside the
  compiled binary. The bundled Pi SDK expects package metadata at runtime.

## Confidence Evidence

- `confidence:runtime`: pass
- confidence checks: 18
- release proposal gate: pass, expected blocked plan
- measurement report: pass
- live Pi smoke skip: pass
- `smoke:binary`: pass after copying package metadata into `dist/`
- full deterministic suite: 240 pass, 2 skip

## Why It Matters

The runtime confidence matrix now gates on the actual north-star ladder rather
than only lower-level CLI commands. It proves package health, reactive planning,
gated effects, deterministic run/eval/trace behavior, hosted envelope
compatibility, registry install, measurement generation, and opt-in live-smoke
posture from one command.

## Tests Run

- `bun run typecheck`
- `bun run confidence:runtime`
- `bun run smoke:binary`
- `bun test test/live-pi-smoke.test.ts test/measure-examples.test.ts test/examples-tour.test.ts`
- `bun test`

## Tests Not Run

- Successful live Pi smoke; the available OpenRouter key still returns a 402
  credits/billing error, tracked in signpost 027.

## Next Slice

Phase 06.4 should update the public-facing docs and diagrams so the package
clearly explains the Pi-backed graph VM, model providers, node sessions,
structured output tool, measurement ladder, and release-gate posture.

## Design Learnings

- Expected failure needs first-class representation in release confidence.
  A blocked effect plan is a pass when the goal is proving gates hold.
- Binary smoke is now a real packaging guardrail for the Pi-backed direction,
  not just a CLI sanity check. The compiled artifact must carry the package
  metadata that bundled runtime dependencies expect.
