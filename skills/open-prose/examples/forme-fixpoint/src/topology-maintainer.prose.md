---
kind: responsibility
id: topology-maintainer
---

# Topology Maintainer (Forme)

The strange heart of the architecture: the node that maintains the **topology
itself** as a versioned world-model. It reads the contract registry, resolves
each contract's `Requires` to a producer's `Maintains`, applies operator pins,
validates the *candidate* graph, and — only if the candidate is valid —
publishes it as the new `active_graph`.

This teaches **topology-as-world-model**: the active graph is not a hidden config
file, it is a maintained, memoized, auditable truth. A seed runs Forme; Forme
commits the active graph; the reconciler schedules ordinary nodes from the latest
**valid committed** topology. Invalid candidates cannot corrupt scheduling.

> **The Cradle.** Forme may *produce* the topology, but the deterministic seed
> and the reconciler are **fixed ground**. The runtime never asks the graph how
> to run the graph before the graph exists. The committed `active_graph` includes
> the topology maintainer itself, yet it never depends on its own *uncommitted*
> output — the seed is the non-recursive bootstrap and recovery path.

### Requires

- the current `ContractRegistry` `contract-set` facet from **Contract Registry**
- the current `OperatorPinLedger` (atomic) from **Operator Pins**

It reads its own prior `TopologyModel` by reference: the topology node may read
its own last committed truth, but **an invalid candidate must never replace the
last valid active graph**.

### Maintains

`TopologyModel` — the versioned topology truth.

```
TopologyModel {
  active_graph {
    nodes, mount_ids, edges, subscribed_facets, entrypoints,
    topology_node_id, active_graph_fingerprint
  },
  control_plane {
    seed_version, reconciler_version, bootstrap_edges,
    topology_node_contract_fingerprint, fixed_ground_statement
  },
  diagnostics {
    missing_producers, ambiguous_producers, rejected_cycles,
    rejected_candidate_graph, pin_suggestions, diagnostics_fingerprint
  },
  commit_status   // accepted | unchanged | rejected | degraded
}
```

#### active-graph

The committed active graph and its `active_graph_fingerprint`. This facet moves
**only when a valid candidate is accepted**. A rejected ambiguous or cyclic
candidate does NOT move it — the prior active graph stands. The Schedule Plan
subscribes to this facet ONLY, so a rejected candidate never rebuilds the
schedule.

#### diagnostics

The validation diagnostics and `diagnostics_fingerprint`. This facet moves when
errors change (an ambiguous producer appears, a cycle is rejected) **even when
the active graph does not**. The Change Reporter distinguishes an active-graph
change from a diagnostics-only change off this split.

### Execution

The intelligent compile is frozen into the committed `replay/`; the run replays
it. Conceptually, on each wake Forme:

1. resolve every contract's `Requires` facets to the producers that `Maintains`
   them
2. apply operator pins to break declared ambiguities
3. validate the candidate: acyclicity, exactly one producer per required facet,
   supported wake sources, entrypoint registration
4. **if valid** → publish the candidate as the new `active_graph`
   (`commit_status: accepted`)
5. **if invalid** → keep the prior `active_graph` and publish only `diagnostics`
   (`commit_status: rejected`)

### Continuity

- input-driven: wake when the `contract-set` facet of the **Contract Registry**
  or the **Operator Pins** ledger changes.
- self-driven: the topology node may read its own prior `TopologyModel` by
  reference, but an invalid candidate must NEVER replace the last valid active
  graph — the read is for diffing, not a wake.
- **Skip** when the contract-set fingerprint and the pins are unchanged — Forme
  renders **at most once per changed contract-set fingerprint** (finite recursion
  / topology memoization).
