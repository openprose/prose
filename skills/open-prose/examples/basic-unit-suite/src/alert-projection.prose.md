---
name: alert-projection
kind: responsibility
---

# Alert Projection

> The **projection boundary** node (U08). It calls the `format-alert-copy`
> function while rendering (U07), commits a material `structured_summary` plus
> cosmetic `markdown` / `html`, and exposes a `structured` facet over the material
> truth ONLY — so a wording-only re-render moves the atomic truth but not the
> `structured` facet, and no downstream subscriber wakes.

### Requires

- `AlertState`: the current alert status. *(Maintained by `alert-state`.)*

`alert-projection` is **input-driven** off the alert state.

### Maintains

The `AlertProjection` world-model.

- `structured_summary` — the material projection (`status`, `threshold`,
  `subject`). This is what downstream subscribes to.
- `markdown` / `html` — cosmetic renderings derived from the structured truth.
- `projection_hash` — a digest of the rendered artifact.

#### structured

The fingerprint of `structured_summary` ONLY. Cosmetic churn in `markdown` /
`html` (a re-worded sentence) changes the node's atomic truth but does NOT move
`structured`, so a propagation storm never starts from wording changes. A
subscriber to `structured` wakes only when the structured truth actually moves.

**Postcondition:** `structured_summary` reflects the current `AlertState`; the
markdown / html are derived from it and never carry truth the structured summary
lacks. Self-policed before signing.

### Execution

Read `AlertState` by reference, `call format-alert-copy` to compose the subject
and body, then commit the structured summary alongside the markdown and html
projections.

### Continuity

input-driven
