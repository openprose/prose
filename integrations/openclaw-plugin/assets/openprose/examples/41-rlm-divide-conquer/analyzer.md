---
name: analyzer
kind: service
---

requires:
- chunk: a portion of a larger corpus
- query: what to extract or compute

ensures:
- partial-result: information relevant to the query extracted from this chunk
