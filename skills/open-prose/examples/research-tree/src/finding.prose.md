---
name: finding
kind: responsibility
---

# Finding (a leaf of the research tree)

> A leaf node, three levels down the tree. There is one `finding` per source
> excerpt (`A1`, `A2`, … `C2` — eight in the shipped episode). Each finding
> subscribes to ONLY its own `leaf:<id>` facet on the gateway, so a revision to a
> sibling leaf leaves it DARK. It normalizes one claim into a finding record. If
> the excerpt is unparseable it THROWS — a `failed` receipt that carries zero
> fresh tokens and wakes no ancestor; the prior synthesis stands.

### Goal

Each source excerpt is distilled into a single, citable finding, kept current
with its source and no more often than its source actually changes.

### Requires

Subscription contracts — Forme matches each entry to a producing node's
`### Maintains` facet (`Requires.<facet> ↔ Maintains.<facet>`).

- `leaf:<id>`: this finding's own slice of the normalized corpus — its `rev`,
  `claim`, and `corrupt` flag. *(Maintained by `sources-gateway`, facet
  `leaf:<id>`.)*

This is the only subscribed input: a `finding` is **input-driven** off exactly
one gateway facet. It subscribes to its OWN leaf facet and nothing else, which is
why a sibling-leaf revision never wakes it.

### Maintains

The world-model schema — the standing truth this leaf commits:

- `leaf`: this finding's id.
- `sub`: the sub-question this finding rolls up into (`A`, `B`, or `C`).
- `rev`: the source revision this finding reflects.
- `finding`: the distilled, citable claim text.

**Canonicalization spec**: the whole record is material; the truth is exposed as
the atomic facet (this node has no named sub-parts). A re-scan that does not move
the upstream `leaf:<id>` facet never even wakes this node, so it writes a
`skipped` receipt and propagates nothing.

### Continuity

input-driven, off its single gateway leaf facet. A leaf maintains no cadence of
its own — it wakes only when its source slice moves. A corrupt excerpt makes the
render fail (a `failed` receipt); the failure is contained at the leaf and never
propagates UP the tree.
