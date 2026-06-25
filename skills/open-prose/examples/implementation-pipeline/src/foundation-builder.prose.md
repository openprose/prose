---
name: foundation-builder
kind: responsibility
version: 0.15.0
---

# Foundation Builder

> The shared-foundation node and the example's INTENTIONAL FANOUT spine. It
> establishes the shared shapes, invariants, and naming decisions every
> construction lane must conform to. Its `shared-shapes` facet is the one place a
> change is *supposed* to ripple wide: when it moves, all six lanes wake once.

### Goal

Every construction lane builds against one canonical set of shared shapes and
invariants, so a lane never invents a conflicting interface and a foundation
change reaches every lane that depends on it.

### Requires

- `corpus`: the normalized planning corpus — for the shared shape declared in the
  target repo snapshot and the constraints. *(Maintained by `implementation-corpus`.)*

### Maintains

The world-model schema — the shared foundation the lanes conform to.

**Type** — the maintained truth carries:

- `shared_shapes`: the canonical interfaces/types (e.g. the receipt shape) every
  lane must use
- `invariants`: the cross-lane rules (lanes own disjoint paths; rejected lanes
  never integrate)
- `vocabulary`, `deletion_list`, `migration_rules`, `notes_for_lanes`

**Canonicalization spec** — the `shared_shapes` projection is the gating facet.
It moves when a canonical shape changes (e.g. `Receipt@v1` → `Receipt@v2`); that
single move is the fanout that wakes every lane.

### Facets

#### shared-shapes

The canonical shapes + invariants the lanes conform to. This is the fanout spine:
every construction lane subscribes to this facet, so when it moves, all six lanes
wake exactly once — the intentional, auditable blast radius.

### Continuity

Input-driven off `implementation-corpus`. The render reads its prior truth by
reference and self-polices its postconditions before signing.
