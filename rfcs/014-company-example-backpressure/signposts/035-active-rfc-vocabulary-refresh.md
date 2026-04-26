# 035 Active RFC Vocabulary Refresh

Date: 2026-04-26
Branch: `rfc/reactive-openprose`
Commit target: `docs: refresh active rfc runtime vocabulary`

## What Changed

- Updated the top-level RFC index so RFC 013 is clearly historical and RFC 014
  is the active OSS runtime spine.
- Added a supersession note to RFC 013 explaining that provider-protocol,
  fixture-provider, and local-process-provider language is historical where it
  conflicts with RFC 014.
- Updated RFC 014 to include the current runtime vocabulary:
  `graph_vm`, node runners, `model_provider`, graph producers, and artifact
  storage backends.
- Refreshed active Phase 02/06 planning docs so they no longer teach provider
  terminology for node execution, telemetry, or failure classes.

## Why It Matters

The implementation is now ahead of some older planning prose. This slice makes
the docs safer for compaction and future handoffs: a future agent can start
from the RFC index and land on the current graph VM/node-runner model instead
of rebuilding the older flat-provider shape.

## Tests Run

- `git diff --check`
- `rg` scan for stale active RFC phrases such as `provider-backed`,
  `model/provider/model`, `RuntimeProvider`, and provider-call language.

## Tests Not Run

- `bun test` and `bun run typecheck` were not run because this was a
  documentation-only slice that did not alter source, fixtures, or generated
  runtime evidence.

## Next Slice

- Recheck the package after the doc refresh and decide whether any remaining
  source-level cleanup is worth doing before moving the platform contract
  forward.

## Design Learnings

- Historical RFCs are useful, but they need explicit status when the project is
  intentionally jumping to its ideal form rather than preserving older seams.
- The active glossary now mirrors the code: graph VM, node runner, producer,
  model provider, and storage backend are distinct concepts.
