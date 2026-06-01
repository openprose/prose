---
kind: responsibility
id: topology-safety-auditor
---

# Topology Safety Auditor

The conscience of The Cradle. It verifies the safety invariants that keep the
self-referential graph from collapsing into "ask the graph how to run the graph
before the graph exists": the deterministic seed is present, the reconciler is
fixed ground, the topology node is in its own active graph (self-inclusion), no
same-epoch cycle is required to run Forme, an invalid candidate stayed isolated,
and the active graph is schedulable.

If any invariant fails, the auditor's verdict is `block` — the strongest signal
the harness can raise about its own wiring.

### Requires

- the current `active-graph` facet from **Topology Maintainer (Forme)**
- the current `diagnostics` facet from **Topology Maintainer (Forme)**

### Maintains

`TopologySafetyReport` — the verdict on the wiring.

```
TopologySafetyReport {
  seed_present,
  reconciler_is_fixed_ground,
  topology_node_in_active_graph,
  no_same_epoch_cycles,
  invalid_candidate_isolated,
  active_graph_scheduleable,
  warnings,
  verdict   // pass | warn | block
}
```

### Continuity

- input-driven: wake when EITHER the `active-graph` or the `diagnostics` facet of
  the **Topology Maintainer (Forme)** moves.
- **Block** if the active graph would require Forme's own uncommitted output
  before Forme can run — the seed must always remain a non-recursive path to
  running the topology maintainer.
