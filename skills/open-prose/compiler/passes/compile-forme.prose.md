---
name: compile-forme
kind: service
---

# Compile Forme

Prepare Forme wiring for systems discovered during compile.

### Requires

- `sources`: discovered source records.
- `source_root`: repository path containing the source graph.

### Ensures

- `diagnostics`: Forme-related warnings or errors.
- `forme_manifests`: runnable Forme manifests when the compiler version
  supports them.

### Strategies

- Load `../../forme.md`; do not redefine Forme semantics here.
- Treat systems with `### Services` as Forme candidates.
- In Phase 2, record diagnostics and source relationships only; later phases
  emit full runnable Forme manifests into repository IR.
- Fail only when an author claims wiring that is structurally impossible to
  interpret.
