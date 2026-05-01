---
name: dependency-import-demo
kind: system
---

### Services

- `local-analyzer`
- `std/evals/inspector`

### Description

Demonstrates importing a system from the external standard library. The `std/evals/inspector` system is installed and pinned by `prose install`. Local services and dependency systems are wired together by Forme using the same contract-matching algorithm.

### Requires

- `run-path`: path to a completed OpenProse run to analyze

### Ensures

- `analysis`: local analysis combined with dependency inspector findings
