---
name: mapper
kind: service
---

requires:
- items: the original items
- relationships: pairwise comparison results

ensures:
- map: relationship map identifying clusters, central nodes, anomalies, and overall structure
