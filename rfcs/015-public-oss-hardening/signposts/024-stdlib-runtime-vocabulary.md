# Signpost 024: Stdlib Runtime Vocabulary

Date: 2026-04-26
Branch: `rfc/reactive-openprose`

## Slice

Audited stdlib controls, composites, evals, and the `co` starter for stale
runtime-provider wording and overclaims about native dynamic control semantics.

## Changed

- Clarified controls and composites as executable pattern contracts in the
  current OSS runtime.
- Replaced obsolete `fixture/provider` phrasing with scripted Pi graph-node
  execution.
- Reframed pattern-only behaviors such as variable fan-out, race cancellation,
  and retry loops as not native in the current OSS runtime.
- Updated std evals to distinguish runtime profile, graph VM, model provider,
  and node runner.
- Updated the `co` starter checker language away from a generic "runtime
  provider" concept.
- Added focused regression tests for stale pattern/runtime vocabulary.

## Tests

- `bun test test/std-patterns.test.ts test/std-evals.test.ts test/co-package.test.ts`
- `bun run prose publish-check packages/std --strict`
- `bun run prose publish-check packages/co --strict`

## Next

Continue the hardening queue. Remaining good candidates: stdlib imperative
contract wording, `co` starter breadth, deterministic/live evidence separation,
runtime-profile CLI ergonomics, trace telemetry, and CLI error consistency.
