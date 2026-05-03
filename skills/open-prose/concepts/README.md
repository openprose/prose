---
purpose: Responsibility Runtime concept index for OpenProse responsibilities and Reactor
related:
  - ../responsibility-runtime.md
  - ../contract-markdown.md
  - ../forme.md
  - ../prose.md
---

# Concepts

Concept docs define semantic meaning for the intelligent VM. They are not
compiler passes and they are not harness implementation docs.

## Contents

- `responsibility.md` -- the `kind: responsibility` contract: a goal that must
  remain true over time
- `reactor.md` -- the evented reconciliation model that checks
  responsibilities and creates pressure when they drift

## Loading Rule

Load `../responsibility-runtime.md` first for the stack and layer boundaries.
Then load only the concept file needed for the task.
