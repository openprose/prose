---
name: assumption-miner
kind: pattern
---

# Assumption Miner

Heterogeneous services independently list what the material assumes but does not state. Cross-tier disagreement on assumptions reveals hidden dependencies.

### Description

Heterogeneous services independently surface unstated assumptions; cross-tier disagreement reveals hidden dependencies.

### Metadata

- `version`: 0.1.0

### Slots

- `miner` (primary)
  - requires: material, context
  - ensures: assumptions
- `comparator`
  - requires: assumption_lists_by_tier
  - ensures: classified_assumption_map

### Config

- `tiers` (object[], default: {'model': 'opus', 'count': 3}, {'model': 'sonnet', 'count': 2}): Miner configurations specifying model tier and count per tier

### Invariants

- Each miner receives the same material and identical instructions
- Miners work independently — no miner sees another's output

### Shape

- `self`: fan out to miners across tiers, collect assumption lists, delegate comparison
- `delegates`:
  - `miner`: list unstated assumptions in the material — run across tiers
  - `comparator`: classify assumptions by agreement pattern across tiers
- `prohibited`: none

### Requires

- Pattern instance receives:
    miner: string           -- service or system name for each miner
    comparator: string      -- service or system name for the comparator
    material: string        -- the corpus or artifact to examine
    tiers: object[]         -- miner configurations, e.g. [{ model: "opus", count: 3 }, { model: "sonnet", count: 2 }]
    context: string         -- (optional) domain context to help miners distinguish assumptions from common knowledge

### Returns

- Each miner receives the same material and is asked: "What does this assume is true but not explicitly state?"
- Miners work independently — no miner sees another's output
- Comparator receives all assumption lists and classifies each assumption:
  - Universal: surfaced by all tiers — a KNOWN implicit dependency (widely recognizable)
  - Deep: surfaced only by higher tiers — a HIDDEN dependency (requires expertise to notice)
  - Contested: services disagree on whether it IS an assumption — may be a FALSE assumption or a point of genuine ambiguity about what the material presupposes
  - Phantom: surfaced by lower tiers but not higher — likely a MISREADING, not an actual assumption
- `result`: the comparator's classified assumption map
- `raw_assumptions`: per-miner assumption lists with tier metadata

### Delegation

```prose
let raw_assumptions = parallel for tier in tiers:
  repeat tier.count:
    let assumptions = call miner
      material: material
      context: context
      prompt: "List every unstated assumption, where it is required, and what breaks if it is false."
      model: tier.model
    return {
      tier: tier.model,
      assumptions: assumptions
    }

let result = call comparator
  assumption_lists_by_tier: raw_assumptions
  material: material
  context: context
  prompt: "Classify assumptions as universal, deep, contested, or phantom, with tier evidence."

return {
  result: result,
  raw_assumptions: raw_assumptions
}
```

### Notes

This is a seed pattern. Miners do not know other miners exist. The comparator does not know it is part of an assumption miner pattern. The key distinction from blind-review: blind-review asks "what does this say?" and measures comprehension. Assumption miner asks "what does this NOT say?" and measures implicit dependencies. A document can score perfectly clear on blind-review while harboring deep unstated assumptions that only the assumption miner surfaces. The most dangerous assumptions are the DEEP ones — dependencies that are real, load-bearing, and invisible to most readers.
