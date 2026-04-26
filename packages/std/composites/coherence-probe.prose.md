---
name: coherence-probe
kind: composite
---

# Coherence Probe

Compare two corpora that should agree and identify mismatches, drift, and
missing links.

### Requires

- `composite_state`: Json<CoherenceProbeState> - reader, sync analyst, source corpus, target corpus, and comparison criteria

### Ensures

- `composite_result`: Json<CoherenceProbeResult> - agreements, contradictions, omissions, drift risks, and repair suggestions

### Effects

- `pure`: deterministic measurement pattern over declared state

### Execution

```prose
Ask the reader to summarize each corpus against the comparison criteria.
Ask the sync analyst to compare summaries and cited evidence.
Classify each finding as agreement, contradiction, omission, or drift risk.
Prefer specific source references over vague coherence claims.
Return coherence findings and repair suggestions.
```
