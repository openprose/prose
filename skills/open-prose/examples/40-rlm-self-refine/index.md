---
name: rlm-self-refine
kind: program
---

### Services

- `evaluator`
- `refiner`

### Requires

- `artifact`: the artifact to refine
- `criteria`: quality criteria to evaluate against

### Ensures

- `result`: the refined artifact scoring 85+ against criteria

### Strategies

- when score is below 85: refine targeting the specific issues identified
- max 5 refinement iterations
