---
name: local-analyzer
kind: service
---

requires:
- run-path: path to the run to analyze

ensures:
- local-findings: project-specific analysis of the run using local codebase context
