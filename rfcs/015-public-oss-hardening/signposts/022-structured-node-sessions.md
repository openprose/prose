# Signpost 022: Structured Node Sessions

Date: 2026-04-26
Branch: `rfc/reactive-openprose`

## What Changed

- Replaced attempt-level `node_session_ref` JSON strings with structured
  `node_session` objects.
- Store attempts now preserve `session_id`, `graph_vm`, optional URL, and
  session metadata directly.
- Runtime traces now render recorded attempt sessions as
  `session[id file:path]`.
- Kept session file references relative to the node workspace when possible.
- Updated docs to describe how node attempts relate to Pi session artifacts.

## Validation

- `bun test test/run-attempts.test.ts test/run-entrypoint.test.ts test/scripted-pi-session.test.ts test/runtime-planning.test.ts`
- `bun run typecheck`
- `git diff --check`
- Manual deterministic graph run followed by `prose trace`, confirming session
  ids and `.pi/*.jsonl` files are visible in trace output.

## Next

- Continue with named schema definitions or stdlib quality, depending on which
  remaining TODO offers the best public-package leverage.
