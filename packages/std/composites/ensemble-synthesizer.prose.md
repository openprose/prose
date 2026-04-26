---
name: ensemble-synthesizer
kind: composite
---

# Ensemble-Synthesizer

Run multiple independent members on the same task, then synthesize by reasoning
about agreement and disagreement.

### Requires

- `composite_state`: Json<EnsembleSynthesizerState> - member role, synthesizer role, task brief, and ensemble size

### Ensures

- `composite_result`: Json<EnsembleSynthesizerResult> - synthesis, member results, disagreements, and confidence

### Effects

- `pure`: deterministic topology pattern over declared state

### Execution

```prose
Give every ensemble member the same task brief independently.
Prevent members from seeing one another's outputs.
Give the synthesizer all member results and the original task.
Ask the synthesizer to reason about disagreements instead of majority voting.
Return synthesis with confidence and member provenance.
```
