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

### Ensures

- Each miner receives the same material and is asked: "What does this assume is true but not explicitly state?"
- Miners work independently — no miner sees another's output
- Comparator receives all assumption lists and classifies each assumption:
  - Universal: surfaced by all tiers — a KNOWN implicit dependency (widely recognizable)
  - Deep: surfaced only by higher tiers — a HIDDEN dependency (requires expertise to notice)
  - Contested: services disagree on whether it IS an assumption — may be a FALSE assumption or a point of genuine ambiguity about what the material presupposes
  - Phantom: surfaced by lower tiers but not higher — likely a MISREADING, not an actual assumption
- pattern_instance.result contains the comparator's classified assumption map
- pattern_instance.raw_assumptions contains per-miner assumption lists

### Delegation

```javascript
const { miner, comparator, material, tiers, context } = pattern_instance;

// Build miner roster
const roster = [];
for (const tier of tiers) {
  for (let i = 0; i < (tier.count || 1); i++) {
    roster.push({ id: `${tier.model}-${i + 1}`, model: tier.model });
  }
}

// Each miner independently extracts assumptions
const rawAssumptions = {};
for (const minerInstance of roster) {
  const brief = `Examine the following material carefully. List every assumption it makes but does not explicitly state — things that must be true for the material to be correct or coherent, but which are not written down.

For each assumption, explain:
- What is assumed
- Where in the material this assumption is required
- What would break if the assumption were false

${context ? `Domain context: ${context}\n\n` : ""}Material:
${material}`;

  const assumptions = await rlm(brief, null, { use: miner, model: minerInstance.model });
  rawAssumptions[minerInstance.id] = { model: minerInstance.model, assumptions };
}

// Comparator classifies
const comparatorBrief = `${roster.length} independent services across ${tiers.length} capability tiers examined the same material and listed its unstated assumptions.

Classify each unique assumption that was surfaced:
- UNIVERSAL: surfaced by services across all tiers — a widely recognizable implicit dependency
- DEEP: surfaced only by higher-tier services — a hidden dependency requiring expertise to notice
- CONTESTED: services disagree on whether this is actually an assumption — indicates ambiguity about what the material presupposes
- PHANTOM: surfaced by lower tiers but not higher — likely a misreading rather than a real assumption

For each assumption, note which services surfaced it and at which tier.

Assumption lists by tier:
${tiers.map(tier => {
  const tierMiners = roster.filter(a => a.model === tier.model);
  return `\n=== ${tier.model.toUpperCase()} TIER ===\n${tierMiners.map(a =>
    `--- ${a.id} ---\n${rawAssumptions[a.id].assumptions}`
  ).join("\n\n")}`;
}).join("\n")}`;

const analysis = await rlm(comparatorBrief, null, { use: comparator });

pattern_instance.result = analysis;
pattern_instance.raw_assumptions = rawAssumptions;
return(analysis);
```

### Notes

This is a seed pattern. Miners do not know other miners exist. The comparator does not know it is part of an assumption miner pattern. The key distinction from blind-review: blind-review asks "what does this say?" and measures comprehension. Assumption miner asks "what does this NOT say?" and measures implicit dependencies. A document can score perfectly clear on blind-review while harboring deep unstated assumptions that only the assumption miner surfaces. The most dangerous assumptions are the DEEP ones — dependencies that are real, load-bearing, and invisible to most readers.
