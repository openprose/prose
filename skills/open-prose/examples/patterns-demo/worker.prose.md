---
name: worker
kind: service
---

### Requires

- `task`: what to produce or revise
- `feedback`: critic feedback to address (optional, absent on first iteration)

### Ensures

- `output`: work product addressing the task and each feedback item, with unresolved items named
