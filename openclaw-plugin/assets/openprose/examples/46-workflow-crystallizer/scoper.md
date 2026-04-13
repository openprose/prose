---
name: scoper
kind: service
---

requires:
- observation: extracted workflow pattern
- existing-programs: inventory of current .prose examples

ensures:
- scope-options: three scoping options (narrow, medium, broad) with inputs, agents, and phases
- collision-check: overlap analysis with existing programs
- placement: recommended file location and whether it is operational
