---
name: rlm-divide-conquer
kind: program
services: [chunker, analyzer, synthesizer]
---

requires:
- corpus: large corpus to analyze
- query: what to find or compute

ensures:
- answer: comprehensive answer to the query, synthesized from analysis of the full corpus

strategies:
- when corpus exceeds context limits: recursively chunk at semantic boundaries into 4-8 pieces
- when partial results conflict: reconcile with evidence-weighted synthesis
- max recursion depth: 4
