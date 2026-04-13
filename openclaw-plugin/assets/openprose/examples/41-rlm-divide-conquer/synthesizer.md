---
name: synthesizer
kind: service
---

requires:
- partial-results: results from analyzing individual chunks
- query: the original question

ensures:
- answer: unified answer reconciling all partial results, with conflicts noted
