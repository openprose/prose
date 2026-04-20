---
name: reviewer
kind: service
---

### Requires

- `handoffs`: all phase handoffs to review

### Ensures

- `review`: assessment covering internal consistency, completeness, feasibility, trade-off honesty, and clarity
- `verdict`: READY or NEEDS_REVISION with specific critical and minor issues listed
