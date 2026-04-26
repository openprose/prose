# 006 Binary Package Metadata

Date: 2026-04-26
Branch: `rfc/reactive-openprose`
Commit target: `build: write binary package metadata`

## Finding

The binary build compiled `dist/prose` and then copied the root `package.json`
into `dist/`. That made the dist package advertise `bin.prose` as
`./bin/prose.ts`, which is wrong for a compiled binary artifact.

## What Changed

- Added `scripts/write-dist-package.ts`.
- Changed `build:binary` to compile `dist/prose` and then write a dist-specific
  package manifest.
- The generated dist manifest now points `bin.prose` at `./prose` and includes
  only the compiled binary in `files`.
- Marked the RFC 015 TODO item as done.

## Tests Run

- `bun run smoke:binary`
- `cat dist/package.json`
- `bun run typecheck`
- `git diff --check`

## Result

The binary smoke passes, and `dist/package.json` now matches the artifact that
would actually be published or installed from `dist/`.

## Next Slice

Move to local run-store layout or runtime stdout/stderr semantics.
