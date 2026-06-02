---
name: wire
kind: function
---

Run Forme wiring to produce a manifest. This function implements the Forme wiring layer's
wiring algorithm — reading contracts, auto-wiring dependencies by semantic
matching, and producing an execution manifest. Previously a top-level command, now
available as `prose run std/ops/wire`.

### Parameters

- target: path to the system `*.prose.md` file to wire

### Returns

- manifest: forme.manifest.json written to <openprose-root>/runs/{id}/ containing the full wiring graph. The returned manifest is guaranteed to contain the full wiring graph for the target.

### Errors

- not-found: target file does not exist
- unresolvable: one or more services could not be wired — no contract match found

### Strategies

- recursively resolve all contracts reachable from the target system (intra-node `call`
  targets in `### Execution`, and cross-node `### Requires` subscriptions)
- for each contract, read it and build the DAG by matching `### Requires` facet-contracts to
  the `### Maintains` facets of other responsibilities using semantic matching
- detect cycles and report them as errors (acyclicity is a postcondition on the topology)
- write the compiled Forme manifest to <openprose-root>/runs/{id}/forme.manifest.json with the full wiring graph and execution order

### Execution

```prose
let resolved = call resolver
  target: target

let matched = call matcher
  contracts: resolved.contracts

let manifest = call manifest-writer
  graph: matched.graph

return { manifest: manifest.manifest }
```
