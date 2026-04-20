---
name: rlm-pairwise
kind: program
services: [comparator, mapper]
---

### Requires

- items: items to compare pairwise
- relation: the relationship to identify between pairs

### Ensures

- map: a relationship map showing clusters, anomalies, and relationship strengths

### Strategies

- when item count is large: batch pairs into groups of ~25 for parallel processing
- when relationships are ambiguous: report uncertainty with evidence from both sides
