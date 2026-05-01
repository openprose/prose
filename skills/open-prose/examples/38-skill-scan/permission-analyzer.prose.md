---
name: permission-analyzer
kind: service
---

### Requires

- `skill-content`: full contents of a skill directory

### Ensures

- `findings`: severity rating with requested permissions, excessive permissions, and least-privilege recommendation
