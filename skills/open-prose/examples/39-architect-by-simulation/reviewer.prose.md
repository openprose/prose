---
name: reviewer
kind: service
---

### Requires

- `handoffs`: all phase handoffs to review

### Ensures

- `review`: assessment covering internal consistency, missing requirements, feasibility, trade-offs, blocking issues, and non-blocking suggestions
- `verdict`: READY or NEEDS_REVISION with specific critical and minor issues listed
