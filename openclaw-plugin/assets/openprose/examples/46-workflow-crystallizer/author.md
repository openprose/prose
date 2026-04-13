---
name: author
kind: service
---

requires:
- scope: the chosen scope and placement
- existing-programs: patterns to follow

ensures:
- program: a complete, self-reviewed .prose file following spec patterns and avoiding antipatterns

strategies:
- fetch latest prose.md spec and guidance before writing
- self-review against antipatterns: remove unnecessary sessions, over-abstracted agents, restating comments
