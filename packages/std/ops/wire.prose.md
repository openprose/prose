---
name: wire
kind: system
---

### Services

- resolver
- matcher
- manifest-writer

Run Forme wiring to produce a manifest. This system implements the Forme wiring layer's
wiring algorithm — reading service contracts, auto-wiring dependencies by semantic
matching, and producing an execution manifest. Previously a top-level command, now
available as `prose run std/ops/wire`.

### Requires

- target: path to the system `*.prose.md` file to wire

### Ensures

- manifest: forme.manifest.json written to .agents/prose/runs/{id}/ containing the full wiring graph

### Errors

- not-found: target file does not exist
- unresolvable: one or more services could not be wired — no contract match found

### Strategies

- recursively resolve all services from the system's `### Services` section
- for each service, read its contract and build a dependency graph by matching `requires` entries to `ensures` entries from other services using semantic matching
- detect cycles and report them as errors
- write the compiled Forme manifest to .agents/prose/runs/{id}/forme.manifest.json with the full wiring graph and execution order
