---
kind: responsibility
id: topology-change-reporter
---

# Topology Change Reporter

Produces the operator-facing explanation of why the topology moved (or why it
held). It subscribes to BOTH facets of the `TopologyModel` — `active-graph` and
`diagnostics` — so it wakes on either kind of change and can distinguish them:
an active-graph change (a node mounted, an edge rewired) from a
diagnostics-only change (an ambiguity reported while the active graph held).

This node is what makes the active/candidate split *legible*: when a candidate is
rejected, the active graph held but the reporter still explains the rejection.

### Requires

- the current `active-graph` facet from **Topology Maintainer (Forme)**
- the current `diagnostics` facet from **Topology Maintainer (Forme)**

It reads its own prior `TopologyChangeReport` by reference to diff against it.

### Maintains

`TopologyChangeReport` — the operator-facing change narrative.

```
TopologyChangeReport {
  active_graph_changed,
  diagnostics_changed,
  nodes_mounted, nodes_unmounted,
  edges_added, edges_removed, edges_rewired,
  entrypoints_added, entrypoints_removed,
  rejected_candidate_summary,
  operator_explanation
}
```

### Continuity

- input-driven: wake when EITHER the `active-graph` or the `diagnostics` facet of
  the **Topology Maintainer (Forme)** moves.
- self-driven: read the prior `TopologyChangeReport` by reference to diff the new
  state against it.
- Distinguish an active-graph change (a node mounted, an edge rewired) from a
  diagnostics-only change (an ambiguity reported while the active graph held).
