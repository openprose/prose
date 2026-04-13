---
name: choice-blocks-demo
kind: service
---

Demonstrates v2 conditional ensures and strategies as replacements for v1 `choice` blocks. N-way branching becomes conditional ensures with strategies guiding behavior.

requires:
- codebase: the codebase to analyze

ensures:
- action-plan: a prioritized plan for addressing issues found
- if critical issues found: immediate fix plan with incident report
- if moderate issues found: sprint-scheduled fix plan
- if minor issues found: technical debt backlog entries
- if no issues found: clean bill of health with recommendations for maintaining quality

strategies:
- when severity is ambiguous: err toward higher severity
- when multiple severity levels present: address critical first, then batch the rest
