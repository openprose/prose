---
name: compile-forme
kind: service
---

# Compile Forme

Prepare Forme wiring for systems discovered during compile.

### Requires

- `sources`: discovered source records.
- `source_root`: repository path containing the source graph.
- `activations`: activation intent records.

### Ensures

- `diagnostics`: Forme-related warnings or errors.
- `activations`: activation intent records with system fulfillment linked to
  matching `formeManifestId`.
- `formeManifests`: structured runnable Forme manifests for discovered
  systems.

### Strategies

- Load `../../forme.md`; do not redefine Forme semantics here.
- Treat systems with `### Services` as Forme candidates.
- Emit structured JSON manifests into repository IR. Do not embed Markdown
  manifests as strings.
- Resolve service dependencies, caller inputs, service outputs, execution
  order, source snapshot paths, environment requirements, warnings, and
  plain delegation targets before runtime.
- Do not invent a pattern-constraint schema in v0. If a pattern requires
  runtime constraints that cannot be expanded into the graph, emit a warning.
- Link any fulfillment activation for a system to the matching
  `formeManifestId`.
- Fail only when an author claims wiring that is structurally impossible to
  interpret.
