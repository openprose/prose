---
name: implementation-work-plan
kind: responsibility
---

# Implementation Work Plan

> The headline responsibility and the example's teaching node. It normalizes the
> corpus into work items and assigns each to one of SIX FIXED construction lanes,
> exposing ONE FACET PER LANE. The invariant this whole example exists to teach:
>
> **The work plan may change lane CONTENTS; it may not mutate the GRAPH.**
>
> Work it discovers but cannot place in a fixed lane becomes `unassigned_work` on
> its OWN maintained truth — never a seventh mounted node. The topology is frozen.

### Goal

Every work item from the planning corpus is assigned to exactly one of the six
fixed construction lanes, or recorded as unassigned, so the downstream fanout is
data-driven without ever growing the graph.

### Requires

- `corpus`: the normalized planning corpus — the folded docs, repo snapshot, and
  constraints. *(Maintained by `implementation-corpus`.)*
- prior `ImplementationWorkPlan` (self, by reference): so stable work-item ids are
  preserved across wording-only doc edits and only genuinely-moved lanes re-render.

### Maintains

The world-model schema — the standing work plan, its canonicalization spec, its
per-lane facets, and its postconditions.

**Type** — the maintained truth carries:

- `work_items`: the normalized items derived from the corpus
- `lane_assignments`: a map from each of the six fixed lanes to its assigned items
- `owned_paths_by_lane`, `expected_tests_by_lane`, `cross_lane_dependencies`
- `unassigned_work`: items no fixed lane can own (the overflow that is NEVER a
  new node)
- `ambiguous_work`: items that need an operator decision

**Canonicalization spec** — each lane's assigned items are fingerprinted on their
own. A change to one lane's contents moves ONLY that lane's facet; the five
sibling lane facets stay byte-identical, so the five sibling lanes never wake.
`unassigned_work` + `ambiguous_work` move only the `diagnostics` facet.

### Facets

Named parts of this truth. Each `####` part is a facet: its name is at once the
fingerprint unit, the subscription symbol (`Requires.<facet>` ↔ `Maintains.<facet>`),
and the published subtree. A lane subscribes to ONLY its own facet, so a move in
one lane does not wake a sibling lane.

#### lane:sdk-world-model

The items assigned to the SDK World-Model construction lane.

#### lane:sdk-runtime

The items assigned to the SDK Runtime construction lane.

#### lane:sdk-compile

The items assigned to the SDK Compile construction lane.

#### lane:skill-contract

The items assigned to the Skill Contract construction lane.

#### lane:examples-tests

The items assigned to the Examples/Test construction lane.

#### lane:docs-signposts

The items assigned to the Docs/Signpost construction lane.

#### diagnostics

`unassigned_work` and `ambiguous_work` — the overflow surface. Extra work the six
fixed lanes cannot cover is recorded HERE, never as a mounted node.

### Continuity

Input-driven off `implementation-corpus`, plus a self-driven recheck so a stable
work-item id survives a wording-only doc edit. The render reads its prior truth by
reference; it self-polices the postconditions (every item is assigned to a fixed
lane or recorded as unassigned) before signing — no separate judge beat.
