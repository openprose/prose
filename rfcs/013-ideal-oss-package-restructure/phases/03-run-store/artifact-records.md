# Artifact Records Slice

**Date:** 2026-04-25
**Phase:** 03.2 Model Artifacts As First-Class Records

The local store now has first-class artifact records and content-addressed
storage.

## Shape

`LocalArtifactRecord` contains:

- `artifact_id`
- `content_hash`
- `content_type`
- `size_bytes`
- schema validation status
- policy labels
- provenance: run, node, port, direction, and source run
- local storage location
- creation time

Blob content is stored under:

```text
.prose/artifacts/blobs/<hash-prefix>/<content-hash>
```

Record metadata is stored under:

```text
.prose/artifacts/records/<run>/<node>/<port>/<content-hash>.json
```

## Indexes

Artifacts are queryable through local indexes:

- by run id
- by output binding
- by content hash

This lets future status, trace, graph, and hosted envelope surfaces answer
"what artifacts did this run produce?" without walking arbitrary directories.

## Current Gaps

- Existing fixture materialization still writes loose binding files. Phase 03.5
  will route fixture materialization through these artifact APIs.
- Schema status is recorded but not computed. Phase 06 owns schema validation.
- Artifacts are local text blobs for now. Binary/object-store providers can use
  the same record shape later.
