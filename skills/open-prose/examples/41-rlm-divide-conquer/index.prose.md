---
name: rlm-divide-conquer
kind: system
---

### Services

- `chunker`
- `analyzer`
- `synthesizer`

### Requires

- `corpus`: large corpus to analyze
- `query`: what to find or compute

### Ensures

- `answer`: answer synthesized from every chunk, reconciling conflicts and naming any uncovered parts of the corpus

### Strategies

- when corpus exceeds context limits: recursively chunk at semantic boundaries into 4-8 pieces
- when partial results conflict: reconcile with evidence-weighted synthesis
- max recursion depth: 4
