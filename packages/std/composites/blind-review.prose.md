---
name: blind-review
kind: composite
---

# Blind Review

Review an artifact without exposing reviewer outputs to one another, then
compare divergence.

### Requires

- `composite_state`: Json<BlindReviewState> - reviewer, comparator, artifact, criteria, and reviewer tiers

### Ensures

- `composite_result`: Json<BlindReviewResult> - reviews, divergence map, clarity assessment, and comparator notes

### Effects

- `pure`: deterministic measurement pattern over declared state

### Execution

```prose
Give every reviewer the artifact and criteria independently.
Keep reviewer outputs hidden from other reviewers.
Give the comparator all reviews and the original criteria.
Ask the comparator to classify agreement, ambiguity, and capability-tier divergence.
Return reviews and divergence assessment.
```
