# Signpost 020: Binary Publication Surface

Date: 2026-04-26
Branch: `rfc/reactive-openprose`

## What Changed

- Made the repository root package explicitly private/source-only.
- Removed the root `bin.prose` entry so the source tree no longer implies a
  direct package-manager install surface.
- Kept source development on `bun run prose ...`.
- Expanded `scripts/write-dist-package.ts` into a small testable metadata
  generator for the publishable binary package.
- Added public docs that explain the difference between the source workspace
  and `dist/prose`.
- Added `test/binary-package.test.ts` to lock the intended package boundary.

## Validation

- `bun test test/binary-package.test.ts test/docs-public.test.ts`
- `bun run smoke:binary`
- `bun run typecheck`
- `git diff --check`

## Next

- Continue runtime robustness work with Pi runtime-profile preflight and
  session persistence visibility.
- Revisit cross-platform release packaging later if the project chooses npm as
  a binary distribution channel rather than direct release artifacts.
