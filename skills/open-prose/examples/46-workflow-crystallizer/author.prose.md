---
name: author
kind: service
---

### Requires

- `scope`: the chosen scope and placement
- `existing-systems`: patterns to follow

### Ensures

- `system`: self-reviewed `*.prose.md` source file with contracts, service boundaries, execution notes, and fixes for identified antipatterns

### Strategies

- fetch latest prose.md spec and guidance before writing
- self-review against antipatterns: remove unnecessary sessions, over-abstracted agents, restating comments
