---
name: rlm-pairwise
kind: program
services: [comparator, mapper]
---

requires:
- items: items to compare pairwise
- relation: the relationship to identify between pairs

ensures:
- map: a relationship map showing clusters, anomalies, and relationship strengths

strategies:
- when item count is large: batch pairs into groups of ~25 for parallel processing
- when relationships are ambiguous: report uncertainty with evidence from both sides
