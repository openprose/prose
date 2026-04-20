---
name: write-and-refine
kind: service
---

### Requires

- topic: what to write about (default: "a README.md for this project")

### Ensures

- document: a polished, publication-ready document covering the topic
- includes: overview, key sections appropriate to the topic, and code examples where relevant

### Strategies

- when draft is unclear: focus on restructuring and simplifying
- when draft is verbose: cut aggressively while preserving key claims
- when code examples are present: verify they are syntactically correct
- max 3 self-revision passes
