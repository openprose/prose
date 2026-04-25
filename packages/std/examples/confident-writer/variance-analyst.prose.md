---
name: variance-analyst
kind: service
---

### Description

Analyze N identical-input responses for variance, classifying the material's determinism.

### Metadata

- `version`: 0.1.0

### Requires

- `responses`: JSON<Responses> - a set of N responses produced by identical runs of the same agent on the same material

### Ensures

- `analysis`: Markdown<Analysis> - a structured assessment containing:
    - classification: one of DETERMINISTIC, UNDERDETERMINED, or CHAOTIC
    - variance_map: which aspects of the responses are stable vs. varying
    - summary: a brief explanation of the classification


### Effects

- `pure`: deterministic transformation over declared inputs

### Strategies

- compare responses pairwise, noting which claims, structures, and phrasings recur vs. diverge
- classify as DETERMINISTIC when responses are substantively identical across all runs
- classify as UNDERDETERMINED when specific aspects vary while others remain stable — identify the varying aspects
- classify as CHAOTIC when responses vary widely with no stable core
- for UNDERDETERMINED material, pinpoint which passages or aspects of the original material permit multiple valid readings
