# 056: Bun Binary Smoke

**Date:** 2026-04-26
**Phase:** Phase 08 follow-up, release packaging

## What Changed

- Added `build:binary` to compile the OpenProse CLI with Bun:
  `bun build --compile --target=bun --outfile dist/prose ./bin/prose.ts`.
- Added `smoke:binary` to build the binary, run `dist/prose help`, and compile
  `examples/hello.prose.md` through the binary.
- Added the binary smoke to the release-candidate checklist.

## How To Test

- `bun run smoke:binary`
- `bun run typecheck`
- `bun test test/cli-ux.test.ts test/source-ir.test.ts`

## Result

- Binary smoke passed:
  - bundled 2607 modules
  - compiled `dist/prose`
  - binary rendered help
  - binary compiled `examples/hello.prose.md`
- Typecheck passed.
- Targeted CLI/source tests passed: 14 pass.

## Next

- Keep `dist/` ignored; the release artifact is generated, not committed.
- Before publishing an OSS release, run the full release-candidate set including
  `bun run smoke:binary`, `bun run confidence:runtime`, `bun run typecheck`,
  and `bun test`.
