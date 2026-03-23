---
name: error-forensics
kind: program
services: [investigator, classifier, fixer]
---

requires:
- run-path: path to the failed/problematic run
- focus: focus area -- "vm", "program", "context", or "external" (optional, default: auto-detect)

ensures:
- report: forensic analysis with timeline, root cause, causal chain, and prioritized fix recommendations (immediate, permanent, prevention)
