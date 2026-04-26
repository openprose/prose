# Signpost 025: Stdlib Contract Language Regression

Date: 2026-04-26
Branch: `rfc/reactive-openprose`

## Slice

Closed the stdlib imperative-script audit by adding a package-wide regression
instead of relying on one-off grep checks.

## Changed

- Added `test/std-contract-language.test.ts`.
- The test scans public `.prose.md` contracts under `packages/std` and
  `packages/co`.
- It rejects host-specific implementation recipe language such as Bash/Python
  snippets, curl recipes, Claude/Codex/OpenCode host references, and SDK/CLI
  instructions.
- Kept legitimate adapter vocabulary for declared capabilities such as
  filesystem writes, S3-compatible object storage, GCS, email providers, and
  runtime profiles.
- Tightened `prose lint` so ordinary `README.md` documentation is not treated
  as legacy executable source.
- Reordered std memory contract sections into canonical source order.
- Removed a self-referential `std/...` dependency from the std composed-reviewer
  example and regenerated std/co package IR snapshots.

## Tests

- `bun test test/std-contract-language.test.ts test/std-roles.test.ts test/std-evals.test.ts`
- `bun test test/source-tooling.test.ts test/package-ir.test.ts test/std-patterns.test.ts`
- `bun run prose lint packages/std`
- `bun run prose publish-check packages/std --strict`
- `bun run prose publish-check packages/co --strict`

## Next

Continue the public hardening queue. The remaining higher-leverage areas are
`co` starter breadth, deterministic/live evidence separation, runtime-profile
CLI ergonomics, trace telemetry, and CLI error consistency.
