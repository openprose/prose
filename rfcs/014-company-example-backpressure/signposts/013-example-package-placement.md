# 013 Example Package Placement

Date: 2026-04-26
Branch: `rfc/reactive-openprose`
Commit target: `docs: define north star example package`

## What Changed

- Replaced the old root-level example tour with a north-star ladder under
  `examples/north-star/`.
- Kept `examples/` as the package root so existing package, publish-check,
  install, and registry commands remain simple.
- Promoted eight examples from the RFC 014 ladder into executable source
  contracts:
  - `company-signal-brief`
  - `lead-program-designer`
  - `stargazer-intake-lite`
  - `opportunity-discovery-lite`
  - `release-proposal-dry-run`
  - `customer-repo-scaffold-preview`
  - `agent-ecosystem-index-refresh`
  - `merged-pr-fit-review-lite`
- Updated the examples README, package manifest, package IR golden, docs, and
  runtime confidence matrix to point at the new ladder.
- Reworked example tests around the new north-star pressure:
  - smallest useful typed service
  - selective recompute where only the downstream lead-program drafter re-runs
  - required eval acceptance
  - pre-session release gating
  - registry install metadata for `company-signal-brief`

## Testing

- `bun run prose package examples --format json`
- `bun run prose publish-check examples --strict`
- `bun test test/examples-tour.test.ts test/package-ir.test.ts test/run-entrypoint.test.ts test/runtime-control.test.ts test/runtime-materialization.test.ts`
- `bun run typecheck`
- `bun run confidence:runtime`

Result so far: focused tests, typecheck, strict publish-check, and runtime
confidence are passing.

## Notable Learning

Keeping `examples/` as the package root and moving curated contracts into
`examples/north-star/` is the cleanest split. It gives readers a strong visual
signal that these are the new runtime backpressure examples, while preserving
the simple package command:

```bash
bun run prose package examples
```

The lead-program example is already acting as a useful "React for agent
outcomes" smoke: when only `brand_context` changes, OpenProse selects only
`save-grow-program-drafter` and keeps the normalizer/scorer current.

## Next Slice

Phase 01.2 should add the fixture corpus for this ladder: happy, stale,
duplicate, gated, and seeded-bad inputs that map directly to the north-star
examples.
