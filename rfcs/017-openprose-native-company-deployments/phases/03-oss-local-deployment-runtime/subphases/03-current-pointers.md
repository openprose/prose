# 03.3 Current Pointers

## Build

- Add deployment-level current/latest pointers for:
  - entrypoint graph runs
  - graph nodes
  - named outputs
  - memory-like resources
  - trigger keys
- Reuse immutable run and artifact records.
- Make reactive planning read deployment pointers by default.

## Tests

- Re-running the same trigger can return `current`.
- Changing one input recomputes only affected nodes.
- Current pointers advance only after accepted/succeeded runs.
- Failed runs update latest but not current.
- Run `bun test`.

## Commit

Commit as `feat: add deployment current pointers`.

## Signpost

Record recompute savings for a reference-company workflow or north-star analog.

