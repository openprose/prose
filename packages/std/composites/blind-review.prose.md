---
name: blind-review
kind: composite
---

# Blind Review

Heterogeneous reviewers build understanding progressively. Disagreement across capability tiers reveals ambiguity; agreement reveals clarity.

### Description

Heterogeneous reviewers build understanding progressively; cross-tier divergence diagnoses clarity, complexity, and ambiguity.

### Metadata

- `version`: 0.1.0

### Slots

- `reviewer` (primary)
  - requires: task_brief, material
  - ensures: report
- `comparator`
  - requires: staged_reports_by_tier
  - ensures: analysis

### Config

- `tiers` (object[], default: {'model': 'opus', 'count': 3}, {'model': 'sonnet', 'count': 3}, {'model': 'haiku', 'count': 3}): Reviewer configurations specifying model tier and count per tier
- `materials` (string[], default: none): Ordered list of materials to disclose progressively
- `task_brief` (string, default: none): What reviewers should focus on when examining materials
- `output_dir` (string, default: none): Optional directory for reviewer reports

### Invariants

- Reviewers are independent — no reviewer sees another's output
- Materials are disclosed one at a time, in order, to each reviewer
- Reviewers across different tiers receive identical materials and briefs

### Shape

- `self`: fan out to reviewers across tiers, feed material progressively, collect staged reports, delegate comparison
- `delegates`:
  - `reviewer`: examine material and report understanding — run once per tier per reviewer
  - `comparator`: compare reports across tiers and stages, identify divergence
- `prohibited`: none

### Requires

- &compositeState exists at __compositeState with:
    reviewer: string          -- component name for each reviewer
    comparator: string        -- component name for the comparator
    tiers: object[]           -- reviewer configurations, e.g. [{ model: "opus", count: 3 }, { model: "sonnet", count: 3 }, { model: "haiku", count: 3 }]
    materials: string[]       -- ordered list of materials to disclose progressively (file paths, briefs, etc.)
    task_brief: string        -- what reviewers should focus on (e.g. "describe what this system is and intends to do")
    output_dir: string        -- (optional) directory for reviewer reports

### Ensures

- Reviewers are independent — no reviewer sees another's output
- Materials are disclosed one at a time, in order — each reviewer reports understanding after each disclosure
- Reviewers across different tiers receive identical materials and briefs
- Comparator receives all staged reports grouped by material and by tier
- Comparator identifies: agreement (clarity), disagreement (ambiguity), and tier-correlated divergence (complexity)
- &compositeState.result contains the comparator's analysis
- &compositeState.reviews contains the structured per-reviewer, per-stage reports
- &compositeState.divergences contains points of disagreement with tier and stage metadata

### Delegation Loop

```javascript
const { reviewer, comparator, tiers, materials, task_brief, output_dir } = __compositeState;

// Build reviewer roster from tier specs
const roster = [];
for (const tier of tiers) {
  for (let i = 0; i < (tier.count || 1); i++) {
    roster.push({ id: `${tier.model}-${i + 1}`, model: tier.model });
  }
}

// Progressive disclosure: each reviewer sees materials one at a time
const reviews = {}; // reviews[reviewerId][stageIndex] = report

for (const agent of roster) {
  reviews[agent.id] = [];
  let priorUnderstanding = "";

  for (let stage = 0; stage < materials.length; stage++) {
    const material = materials[stage];
    const brief = stage === 0
      ? `${task_brief}\n\nExamine ONLY the following material. Report your understanding as specifically as possible.\n\n${material}`
      : `${task_brief}\n\nYour understanding so far:\n${priorUnderstanding}\n\nNow also examine this additional material. Report how your understanding has changed or deepened.\n\n${material}`;

    const report = await rlm(brief, null, { use: reviewer, model: agent.model });
    reviews[agent.id].push({ stage, material_ref: material, report });
    priorUnderstanding = report;
  }
}

// Comparator analyzes across tiers and stages
const comparatorBrief = `${roster.length} independent reviewers across ${tiers.length} capability tiers examined the same materials progressively. Compare their reports.

Identify:
1. Points of AGREEMENT across all tiers (high clarity — the material communicates unambiguously)
2. Points of DISAGREEMENT within a tier (noise — individual variation)
3. Points of DISAGREEMENT across tiers (ambiguity or complexity — the material may be unclear)
4. Understanding that only emerges at higher tiers (complexity that rewards capability)

Task context: ${task_brief}

Reviews by tier:
${tiers.map(tier => {
  const tierAgents = roster.filter(a => a.model === tier.model);
  return `\n=== ${tier.model.toUpperCase()} TIER ===\n${tierAgents.map(a =>
    `--- ${a.id} ---\n${reviews[a.id].map((r, i) =>
      `[After material ${i + 1}]: ${r.report}`
    ).join("\n")}`
  ).join("\n\n")}`;
}).join("\n")}`;

const analysis = await rlm(comparatorBrief, null, { use: comparator });

// Extract divergences
__compositeState.result = analysis;
__compositeState.reviews = reviews;
return(analysis);
```

### Notes

This is a seed pattern. Reviewers do not know other reviewers exist. The comparator does not know it is part of a blind review composite. The two structural innovations over a standard ensemble are:

**Heterogeneous tiers.** The tier variation is not a cost-saving measure — it is the diagnostic instrument. Cross-tier response patterns produce three distinct diagnoses:

- **Clear:** All tiers agree (including haiku). The material communicates unambiguously regardless of capability.
- **Complex but unambiguous:** Higher tiers agree, lower tiers struggle or diverge. The material rewards capability but is not unclear — it is genuinely difficult.
- **Ambiguous:** Agents within the same tier disagree with each other (especially at higher tiers). The material itself is unclear — more capability does not resolve the disagreement because the source of divergence is in the material, not the reader.

**Progressive disclosure.** By feeding material incrementally and collecting reports at each stage, the orchestrator can identify exactly *which piece of material* introduces divergence. This turns a binary "agree/disagree" into a localized ambiguity map.

The combination produces a diagnostic tool: run a blind review on your documentation, specification, or design, and the divergence pattern tells you where your communication is unclear, where it is merely complex, and where it is genuinely ambiguous.
