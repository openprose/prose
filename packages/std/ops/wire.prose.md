---
name: wire
kind: program
---

Project canonical OpenProse IR into the readable manifest view used by tools,
reviews, and hosted ingest.

### Requires

- `target`: string - path to the program `.prose.md` file to wire

### Ensures

- `manifest`: Markdown<Manifest> - manifest projection with components, ports, effects, dependencies, and graph edges

### Errors

- not-found: target file does not exist
- unresolvable: one or more services could not be wired — no contract match found

### Effects

- `read_external`: reads workspace, package, or run artifacts for operational analysis

### Strategies

- compile the target source into canonical Prose IR
- project component contracts, typed ports, effects, access labels, package dependencies, and graph edges into a readable manifest
- include diagnostics and unresolved references rather than inventing missing wiring
- keep the manifest a projection of IR; do not make it a second source of truth
