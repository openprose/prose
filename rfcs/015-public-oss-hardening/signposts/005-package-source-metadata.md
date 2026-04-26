# 005 Package Source Metadata

Date: 2026-04-26
Branch: `rfc/reactive-openprose`
Commit target: `chore: infer examples package source metadata`

## Finding

`examples/prose.package.json` hardcoded a branch-tip source SHA. That made the
package manifest stale after every subsequent commit, even though the package
metadata generator can infer the current git remote, commit SHA, and subpath.

## What Changed

- Removed the explicit source block from `examples/prose.package.json`.
- Kept `std` and `co` on the same inferred-source pattern they already used.
- Updated RFC 015 to record the source metadata policy: source manifests should
  not pin branch-tip SHAs; generated package metadata materializes the current
  source identity.

## Tests Run

- `bun run prose package examples --format json --no-pretty`
- `bun run prose publish-check examples --strict --format json --no-pretty`
- `bun run prose publish-check packages/std --strict --format json --no-pretty`
- `bun run prose publish-check packages/co --strict --format json --no-pretty`
- `bun test test/package-registry.test.ts`
- `bun run confidence:runtime`
- `git diff --check`

## Result

- Generated examples package metadata now uses the current git SHA and
  `examples` subpath.
- Strict publish checks pass for examples, std, and co.
- Runtime confidence passes with updated install metadata previews.

## Next Slice

Move to distribution packaging or local run-store layout.
