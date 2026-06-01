---
name: construction-review
kind: responsibility
---

# Construction Review

> The cross-lane gate. It fans in from all six construction lanes and the
> foundation, checks each lane's proposed patch against its owned paths and the
> forbidden-operation policy, and ACCEPTS or REJECTS each lane. A rejected lane
> never reaches integration — that exclusion is the teaching point of IP04.

### Goal

Every lane output is checked for path-ownership violations, forbidden operations,
and cross-lane conflicts before any of it is integrated, so an unsafe lane is
caught at the gate rather than in the merged tree.

### Requires

- the six `LaneState` truths — one per construction lane. *(Maintained by the six
  `construction-lane` nodes; this is the diamond fan-in.)*
- `corpus`: for the forbidden-operation policy. *(Maintained by
  `implementation-corpus`.)*

### Maintains

The world-model schema — the review verdict.

**Type** — the maintained truth carries:

- `accepted_lanes`: the lanes whose patches stay inside their owned paths
- `rejected_lanes`: each `{ lane, reason }` for a path-ownership / forbidden-path
  violation
- `cross_lane_conflicts`, `missing_tests`, `export_requests`, `open_issues`
- `ready_for_integration`: `all` or `accepted-only`

**Canonicalization spec** — the `accepted` facet projects only
`{ accepted_lanes, rejected_lanes }`, so the integration node wakes when the
accept/reject SET changes, not on cosmetic churn.

### Facets

#### accepted

The accept/reject verdict the `integration-builder` subscribes to. A rejected
lane appears here with its reason and is excluded downstream by construction.

### Continuity

Input-driven. A no-op lane that did not move leaves the verdict unchanged; the
review memo-skips on an unchanged quiet re-wake.
