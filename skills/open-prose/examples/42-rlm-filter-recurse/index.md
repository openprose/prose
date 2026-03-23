---
name: rlm-filter-recurse
kind: program
services: [screener, investigator, reasoner]
---

requires:
- documents: collection of documents to search
- question: question requiring multi-source evidence

ensures:
- answer: evidence-based answer with reasoning chain and source citations

strategies:
- when initial screening finds few relevant documents: broaden relevance criteria
- when evidence gaps remain after first pass: refine query to target gaps and recurse
- max recursion depth: 3
