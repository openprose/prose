# 008 Path-Safe Store IDs

Date: 2026-04-26
Branch: `rfc/reactive-openprose`
Commit target: `test: lock path-safe store ids`

## Finding

OpenProse intentionally uses readable IDs such as `graph-run:review` for node
runs and attempts. The risk is not the display ID itself; the risk is using
that display ID as an unescaped filesystem, API, or object-storage path segment.

## Decision

Do not churn public run IDs for this slice. Keep readable IDs in records and
make path safety an encoding responsibility at storage boundaries.

## What Changed

- Added a run-attempt regression test proving run IDs are URL-encoded before
  they become local store paths.
- Added an artifact-store regression test proving run IDs, node IDs, and port
  IDs are URL-encoded before they become local artifact record paths.
- Marked the RFC 015 TODO item as done.

## Tests Run

- `bun test test/run-attempts.test.ts test/artifact-store.test.ts`
- `bun run typecheck`
- `git diff --check`

## Result

Readable record IDs remain stable, while filesystem paths are explicitly
path-safe at the store boundary.

## Next Slice

Move to remote stdout/stderr semantics or schema validation depth.
