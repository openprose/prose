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
- `formeManifests`: structured runnable Forme manifests for discovered
  systems.

### Strategies

- Load `../../forme.md`; do not redefine Forme semantics here.
- Treat systems with `### Services` as Forme candidates.
- Emit structured JSON manifests into repository IR. Do not embed Markdown
  manifests as strings.
- Resolve service dependencies, caller inputs, service outputs, execution
  order, source snapshot paths, environment requirements, warnings, and
  delegation constraints before runtime.
- Link any fulfillment activation for a system to the matching
  `formeManifestId`.
- Fail only when an author claims wiring that is structurally impossible to
  interpret.
