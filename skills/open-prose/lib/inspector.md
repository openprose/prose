---
name: inspector
kind: program
services: [index, extractor, evaluator, synthesizer]
---

requires:
- run-path: path to the run to inspect (e.g., .prose/runs/20260119-100000-abc123)
- depth: inspection depth -- "light" or "deep"
- target: evaluation target -- "vm", "task", or "all"

ensures:
- inspection: structured output with verdict JSON, mermaid flow diagram, and summary report
