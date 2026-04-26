---
name: assumption-miner
kind: composite
---

# Assumption Miner

Surface implicit assumptions in an artifact, then compare which assumptions are
visible across reviewers or capability tiers.

### Requires

- `composite_state`: Json<AssumptionMinerState> - miner, comparator, artifact, context, and review configuration

### Ensures

- `composite_result`: Json<AssumptionMinerResult> - assumptions, evidence, visibility classes, and comparator notes

### Effects

- `pure`: deterministic measurement pattern over declared state

### Execution

```prose
Ask miners to identify assumptions required by the artifact.
Require evidence or rationale for every assumption.
Group assumptions by explicit, implicit, risky, or unsupported status.
Give the comparator all mined assumptions and the artifact context.
Return the assumption inventory and visibility analysis.
```
