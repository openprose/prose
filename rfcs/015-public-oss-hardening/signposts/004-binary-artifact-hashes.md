# 004 Binary Artifact Hashes

Date: 2026-04-26
Branch: `rfc/reactive-openprose`
Commit target: `fix: hash remote artifact bytes directly`

## Finding

Remote artifact manifests read files as bytes, but hashed
`raw.toString("utf8")`. That changes non-UTF8 content before hashing, which is
wrong for binary artifacts and hosted object-store integrity checks.

## What Changed

- Changed `sha256` to accept `string | Uint8Array`.
- Changed remote artifact manifest generation to hash the raw file bytes.
- Added a regression test with a non-UTF8 `payload.bin` artifact and an
  independently computed expected hash.
- Marked the RFC 015 TODO item as done.

## Tests Run

- `bun test test/runtime-materialization.test.ts test/hosted-contract-fixtures.test.ts`
- `bun run typecheck`
- `git diff --check`

## Result

- Focused runtime and hosted contract fixture tests passed.
- Typecheck passed.
- Binary artifact manifest hashes now preserve raw bytes.

## Next Slice

Move to package metadata source SHA policy or local store layout.
