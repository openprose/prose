---
name: conditionals-demo
kind: service
---

Demonstrates v2 conditional ensures as replacements for v1 `if/elif/else` patterns. Conditions become declarative output variants.

requires:
- project: the project to evaluate

ensures:
- status-report: project status with recommended actions
- if project is ahead of schedule: report documenting success factors with stretch goal recommendations
- if project is on track: standard status report with current plan confirmation
- if project is slightly delayed: bottleneck analysis with adjusted timeline and stakeholder communication
- if project is significantly delayed: escalation report with recovery plan and daily standup schedule

strategies:
- when status is ambiguous: gather more evidence before classifying
- when multiple signals conflict: weight recent data more heavily
