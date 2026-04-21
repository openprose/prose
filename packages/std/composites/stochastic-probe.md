---
name: stochastic-probe
kind: composite
---

# Stochastic Probe

Run the same agent on the same material N times. Variance in responses measures how much the material underdetermines its interpretation.

### Description

Run the same agent on identical inputs N times; variance in responses measures how much the material underdetermines interpretation.

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
- `task_brief` (string, default: none): The question to pose against the material
- `material` (string, default: none): The corpus or artifact to examine

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

- &compositeState exists at __compositeState with:
    probe: string             -- component name for the probe agent
    analyst: string           -- component name for the variance analyst
    task_brief: string        -- the question to pose against the material
    material: string          -- the corpus or artifact to examine
    sample_size: number       -- (optional, default 7) number of runs
    model: string             -- (optional) model tier to probe at — fixing the tier isolates material variance from capability variance

### Ensures

- All N runs receive IDENTICAL inputs — same brief, same material, same model
- Temperature and sampling inherent to the model are the ONLY source of variation
- Analyst receives all N responses and classifies the material as:
  - Deterministic: responses are substantively identical — the material constrains interpretation tightly
  - Underdetermined: responses vary in specific areas — those areas permit multiple valid readings
  - Chaotic: responses vary widely — the material fails to constrain interpretation at all
- Analyst identifies WHICH aspects of the responses vary and which are stable
- &compositeState.result contains the analyst's classification and variance map
- &compositeState.responses contains the N raw responses

### Delegation Loop

```javascript
const { probe, analyst, task_brief, material, sample_size = 7, model } = __compositeState;

// Run the same probe N times — identical inputs
const responses = [];
for (let i = 0; i < sample_size; i++) {
  const opts = model ? { use: probe, model } : { use: probe };
  const response = await rlm(
    `${task_brief}\n\nMaterial:\n${material}`,
    null,
    opts
  );
  responses.push(response);
}

// Analyst measures variance
const analystBrief = `${sample_size} identical runs of the same agent on the same material produced the following responses. The agent, prompt, and material were identical across all runs — any variation comes from the material's ambiguity, not the agent's inconsistency.

Analyze:
1. Which aspects of the responses are STABLE across all runs? (The material determines these.)
2. Which aspects VARY? (The material underdetermines these — multiple valid readings exist.)
3. Classify the material overall:
   - DETERMINISTIC: responses substantively identical
   - UNDERDETERMINED: specific aspects vary, others stable
   - CHAOTIC: responses vary widely with no stable core

For underdetermined material, identify the specific passages or aspects that permit multiple readings.

Original task: ${task_brief}

Responses:
${responses.map((r, i) => `--- Run ${i + 1} ---\n${r}`).join("\n\n")}`;

const analysis = await rlm(analystBrief, null, { use: analyst });

__compositeState.result = analysis;
__compositeState.responses = responses;
return(analysis);
```

### Notes

This is a seed pattern. The probe does not know it is being run multiple times. The analyst does not know it is part of a stochastic probe composite. The measurement is orthogonal to blind-review: blind-review measures cross-tier divergence (is the material clear to different capability levels?), while stochastic probe measures within-tier stability (does the material produce the same reading every time?). Material can be clear but underdetermined (everyone understands it, but they understand it differently each time) or deterministic but complex (it always produces the same reading, but only at high tiers).
