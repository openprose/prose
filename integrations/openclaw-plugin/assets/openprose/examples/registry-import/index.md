---
name: registry-import-demo
kind: program
services: [local-analyzer, openprose/lib/inspector]
---

Demonstrates importing a service from the registry. The `openprose/lib/inspector` service is resolved from `https://p.prose.md/openprose/lib/inspector`. Local and registry services are wired together by Forme using the same contract-matching algorithm.

requires:
- run-path: path to a completed .prose run to analyze

ensures:
- analysis: local analysis combined with registry inspector findings
