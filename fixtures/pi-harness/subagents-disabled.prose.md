---
name: pi-harness-subagents-disabled
kind: service
---

### Runtime

- `subagents`: false

### Ensures

- `message`: Markdown<Message> - direct response without child-session delegation

### Effects

- `pure`: deterministic synthesis
