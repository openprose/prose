---
name: phase-executor
kind: service
---

### Requires

- task: the phase to execute
- previous-handoffs: what has been decided in prior phases

### Ensures

- handoff: document covering what was analyzed, decisions made with rationale, trade-offs considered, and recommendations for the next phase
