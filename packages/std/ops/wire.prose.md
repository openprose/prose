---
name: wire
kind: program
---

### Services

- resolver
- matcher
- manifest-writer

Run Forme wiring to produce a manifest. This program implements the Forme container's
wiring algorithm — reading component contracts, auto-wiring dependencies by semantic
matching, and producing an execution manifest. Previously a top-level command, now
available as `prose run std/ops/wire`.

### Requires

- `target`: string - path to the program `.prose.md` file to wire

### Ensures

- `manifest`: Markdown<Manifest> - manifest.md written to .prose/runs/{id}/ containing the full wiring graph


### Effects

- `read_external`: reads workspace, package, or run artifacts for operational analysis

### Errors

- not-found: target file does not exist
- unresolvable: one or more services could not be wired — no contract match found

### Strategies

- recursively resolve all services from the program's `services:` list
- for each service, read its contract and build a dependency graph by matching `requires` entries to `ensures` entries from other services using semantic matching
- detect cycles and report them as errors
- write the execution manifest to .prose/runs/{id}/manifest.md with the full wiring graph and execution order
