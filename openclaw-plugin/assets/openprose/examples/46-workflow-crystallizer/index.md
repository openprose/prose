---
name: workflow-crystallizer
kind: program
services: [observer, scoper, author, compiler]
---

requires:
- thread: the conversation thread to analyze
- hint: what aspect to focus on (optional)

ensures:
- crystallized: a validated .prose program extracted from the observed workflow pattern, written to the appropriate location

strategies:
- when workflow overlaps with existing program: assess unique value before creating
- when compilation fails: fix and retry, max 3 attempts
