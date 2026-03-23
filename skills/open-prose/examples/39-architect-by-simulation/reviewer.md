---
name: reviewer
kind: service
---

requires:
- handoffs: all phase handoffs to review

ensures:
- review: assessment covering internal consistency, completeness, feasibility, trade-off honesty, and clarity
- verdict: READY or NEEDS_REVISION with specific critical and minor issues listed
