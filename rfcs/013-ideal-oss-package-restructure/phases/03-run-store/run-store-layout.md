# Local Run Store Layout Slice

**Date:** 2026-04-25
**Phase:** 03.1 Define Store Layout, Versions, And Indexes

OpenProse now has a typed local store foundation that mirrors the hosted model
without requiring hosted infrastructure.

## Layout

The canonical local store root is `.prose/`:

```text
.prose/
  runs/
  artifacts/
  graphs/
  indexes/
    runs.json
  meta/
    store.json
```

`resolveLocalStoreLayout(root)` produces the normalized layout and
`initLocalStore(root)` creates the directories plus version metadata.

## Version Metadata

`meta/store.json` contains:

- `store_version`
- `created_at`
- `updated_at`
- layout directory names
- applied migrations

Only `0.1` is supported in this slice. Unsupported versions are rejected before
migration hooks exist so future migrations fail loudly rather than silently
misreading state.

## APIs

This slice adds:

- immutable JSON record writes
- JSON record reads
- run index read/upsert
- store metadata read/init

Fixture materialization does not write through the store yet. That happens in
03.5 after artifact records and graph node pointers exist.

## Current Gaps

- Artifacts are still loose files in existing materialization output.
- Graph current/latest pointers are not modeled yet.
- Attempts, retry state, and resume points are not modeled yet.
- `status` and `trace` still read the old run-directory shape until later
  Phase 03 slices migrate them.
