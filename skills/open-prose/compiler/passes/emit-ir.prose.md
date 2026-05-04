---
name: emit-ir
kind: service
---

# Emit IR

Build the repository IR JSON manifest from compile pass outputs.

### Requires

- `sources`: discovered source records.
- `responsibilities`: compiled responsibility records.
- `triggers`: concrete serve-facing trigger registration records.
- `activations`: compiled activation intent records.
- `formeManifests`: compiled Forme wiring manifests.
- `diagnostics`: compile diagnostics.

### Ensures

- `manifest`: repository IR JSON object ready for deterministic validation.

### Strategies

- Use `kind: openprose.repository-ir`.
- Use `version: 0`.
- Emit arrays for both `sources` and `diagnostics`, even when empty.
- Emit arrays for `responsibilities`, `triggers`, and `activations`, even when
  empty.
- Emit `formeManifests` as an array, even when empty.
- Emit source paths relative to `<openprose-root>`, ready to pass to
  `prose run` from the root.
- Do not include prose, scratch notes, comments, or Markdown fences in the JSON
  payload.
