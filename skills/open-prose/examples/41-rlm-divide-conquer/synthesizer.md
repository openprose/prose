---
name: synthesizer
kind: service
---

### Requires

- `partial-results`: results from analyzing individual chunks
- `query`: the original question

### Ensures

- `answer`: unified answer reconciling all partial results, with conflicts noted
