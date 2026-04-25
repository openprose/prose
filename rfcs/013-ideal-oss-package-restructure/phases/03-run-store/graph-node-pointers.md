# Graph Node Pointers Slice

**Date:** 2026-04-25
**Phase:** 03.3 Add Graph Node Current And Latest Pointers

The local store now tracks mutable graph node pointers separately from
immutable run and artifact records.

## Pointer Shape

`LocalGraphNodePointer` records:

- graph id
- node id
- component ref
- current accepted run id
- latest observed run id
- latest failed run id
- latest pending/blocked/running run id
- update timestamp

Accepted successful runs become `current`. Failed and pending runs can become
`latest`, `failed`, or `pending`, but they do not replace the current accepted
run.

## Store Paths

Pointers are stored under:

```text
.prose/graphs/<graph-id>/nodes/<node-id>.json
```

This keeps graph state mutable and small while run records remain immutable.

## Status Integration

`statusPath(root)` now detects a store root by reading `meta/store.json`. When
called with `.prose/`, it reads `indexes/runs.json` rather than walking loose
run directories. Existing status behavior for old run directories remains in
place until fixture materialization moves fully onto the store.

## Current Gaps

- Trace and graph views still primarily read old run-directory and plan inputs.
  They should move onto store indexes once attempts and fixture store writes are
  complete.
- Pointer updates are explicit API calls. The runtime/meta-harness will call
  them automatically after accepted materialization in later phases.
