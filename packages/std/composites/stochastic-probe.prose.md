---
name: stochastic-probe
kind: composite
---

# Stochastic Probe

Run the same probe multiple times on identical material to measure response
variance.

### Requires

- `composite_state`: Json<StochasticProbeState> - probe, analyst, task brief, material, sample size, and model constraints

### Ensures

- `composite_result`: Json<StochasticProbeResult> - raw responses, stable aspects, variant aspects, and determinism classification

### Effects

- `pure`: deterministic measurement pattern over declared state

### Execution

```prose
Give every probe run the same task, material, and model constraints.
Collect all responses without showing probes one another's outputs.
Give the analyst every response and the original material.
Ask the analyst to identify stable and varying aspects.
Return the variance profile and determinism classification.
```
