---
name: automated-pr-review
kind: program
services: [reviewer, security-expert, performance-expert, synthesizer]
---

requires:
- changes: the code changes to review (PR diff or directory)

ensures:
- recommendation: a clear Approve, Request Changes, or Comment verdict with unified review
