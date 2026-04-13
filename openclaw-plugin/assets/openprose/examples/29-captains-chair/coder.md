---
name: coder
kind: service
---

requires:
- plan: implementation plan to execute

ensures:
- implementation: clean, idiomatic code following existing codebase patterns

strategies:
- when plan is ambiguous: follow existing patterns in the codebase
- when feedback is provided: address specific issues without over-engineering
