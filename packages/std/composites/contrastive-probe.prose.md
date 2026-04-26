---
name: contrastive-probe
kind: composite
---

# Contrastive Probe

Run the same measurement against two candidates and rank the candidates on the
measured dimension.

### Requires

- `composite_state`: Json<ContrastiveProbeState> - measurement pattern, ranker, candidate A, candidate B, and criteria

### Ensures

- `composite_result`: Json<ContrastiveProbeResult> - measurement outputs, comparison, winner, confidence, and caveats

### Effects

- `pure`: deterministic measurement pattern over declared state

### Execution

```prose
Run the measurement pattern on candidate A and candidate B under the same criteria.
Keep measurement conditions symmetric.
Give the ranker both measurement outputs and the original criteria.
Ask the ranker to choose a winner only when evidence supports it.
Return measurements, ranking, confidence, and caveats.
```
