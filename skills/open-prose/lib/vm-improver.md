---
name: vm-improver
kind: program
services: [analyst, researcher, implementer, pr-author]
---

requires:
- inspection-path: path to inspection output (bindings/inspection.md)
- prose-repo: path to prose skill directory (e.g., prose/skills/open-prose)

ensures:
- result: PRs to the prose repo implementing VM improvements
- if no improvements needed: clean status with explanation
