---
kind: responsibility
id: schedule-plan
---

# Schedule Plan Projection

Projects the committed `active_graph` into the schedule the reconciler reads:
topological layers, entrypoint registrations, and the downstream wake routes per
subscribed facet. The reconciler is **not a node** — it is the fixed runtime that
reads the latest valid `active_graph` and schedules ordinary nodes from it. This
projection is just the read-friendly shape it consumes.

This is the proof that **a rejected candidate cannot corrupt scheduling**: the
schedule plan subscribes to the `active-graph` facet ONLY. When Forme rejects an
ambiguous or cyclic candidate, the `active-graph` facet does not move, so this
projection memo-skips — the schedule stays exactly as it was over the last valid
graph.

### Requires

- the current `active-graph` facet from **Topology Maintainer (Forme)**

It deliberately does NOT subscribe to the `diagnostics` facet: a diagnostics-only
topology change must not rebuild the schedule plan.

### Maintains

`SchedulePlan` — the runtime-ready projection of the active graph.

```
SchedulePlan {
  active_graph_fingerprint,
  topological_layers,
  entrypoint_registrations,
  wake_routes_by_facet,
  schedule_ready
}
```

### Continuity

- input-driven: wake when the `active-graph` facet of the **Topology Maintainer
  (Forme)** moves.
- A diagnostics-only topology change does NOT rebuild the schedule plan — this
  node never subscribes to `diagnostics`, so a rejected candidate never wakes it
  and the schedule memo-skips over the last valid active graph.
