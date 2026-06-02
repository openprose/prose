---
name: stochastic-probe
kind: pattern
---

# Stochastic Probe

Run the same service on the same material N times. Variance in responses measures how much the material underdetermines its interpretation.

### Description

Run the same service on identical inputs N times; variance in responses measures how much the material underdetermines interpretation.

### Metadata

- `version`: 0.1.0

### Slots

- `probe` (primary)
  - requires: task_brief, material
  - ensures: response
- `analyst`
  - requires: responses
  - ensures: analysis

### Config

- `sample_size` (number, default: 7): Number of identical probe runs
- `model` (string, default: none): Model tier to probe at — fixing the tier isolates material variance from capability variance

### Invariants

- All N runs receive identical inputs — same brief, same material, same model
- Temperature and sampling inherent to the model are the only source of variation

### Shape

- `self`: run probe N times with identical inputs, collect responses, delegate variance analysis
- `delegates`:
  - `probe`: respond to the brief — run N times with identical configuration
  - `analyst`: quantify variance across N responses, classify determinism
- `prohibited`: none

### Requires

- Pattern instance receives:
    probe: string             -- service or system name for the probe service
    analyst: string           -- service or system name for the variance analyst
    task_brief: string        -- the question to pose against the material
    material: string          -- the corpus or artifact to examine
    sample_size: number       -- (optional, default 7) number of runs
    model: string             -- (optional) model tier to probe at — fixing the tier isolates material variance from capability variance

### Maintains

- All N runs receive IDENTICAL inputs — same brief, same material, same model
- Temperature and sampling inherent to the model are the ONLY source of variation
- Analyst receives all N responses and classifies the material as:
  - Deterministic: responses are substantively identical — the material constrains interpretation tightly
  - Underdetermined: responses vary in specific areas — those areas permit multiple valid readings
  - Chaotic: responses vary widely — the material fails to constrain interpretation at all
- Analyst identifies WHICH aspects of the responses vary and which are stable
- `result`: the analyst's classification and variance map
- `responses`: the N raw responses

### Delegation

```prose
let responses = parallel repeat sample_size:
  call probe
    task_brief: task_brief
    material: material
    model: model

let result = call analyst
  responses: responses
  material: material
  prompt: "Classify stable aspects, varying aspects, and whether the material is deterministic, underdetermined, or chaotic."

return {
  result: result,
  responses: responses
}
```

### Notes

This is a seed pattern. The probe does not know it is being run multiple times. The analyst does not know it is part of a stochastic probe pattern. The measurement is orthogonal to blind-review: blind-review measures cross-tier divergence (is the material clear to different capability levels?), while stochastic probe measures within-tier stability (does the material produce the same reading every time?). Material can be clear but underdetermined (everyone understands it, but they understand it differently each time) or deterministic but complex (it always produces the same reading, but only at high tiers).
