---
name: registry-import-demo
kind: program
---

### Services

- `local-analyzer`
- `std/evals/inspector`

### Description

Demonstrates importing a service from the external standard library. The `std/evals/inspector` service is installed and pinned by `prose install`. Local and dependency services are wired together by Forme using the same contract-matching algorithm.

### Requires

- `run-path`: path to a completed .prose run to analyze

### Ensures

- `analysis`: local analysis combined with registry inspector findings
