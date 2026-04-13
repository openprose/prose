---
name: permission-analyzer
kind: service
---

requires:
- skill-content: full contents of a skill directory

ensures:
- findings: severity rating with requested permissions, excessive permissions, and least-privilege recommendation
