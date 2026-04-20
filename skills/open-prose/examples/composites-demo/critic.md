---
name: critic
kind: service
---

### Requires

- `output`: the worker's output to evaluate
- `quality-bar`: what constitutes acceptable quality

### Ensures

- `score`: numeric quality score 0-100
- `feedback`: specific issues to address if score is below threshold
- `accepted`: whether the output meets the quality bar
