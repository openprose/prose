---
name: rlm-self-refine
kind: program
services: [evaluator, refiner]
---

requires:
- artifact: the artifact to refine
- criteria: quality criteria to evaluate against

ensures:
- result: the refined artifact scoring 85+ against criteria

strategies:
- when score is below 85: refine targeting the specific issues identified
- max 5 refinement iterations
