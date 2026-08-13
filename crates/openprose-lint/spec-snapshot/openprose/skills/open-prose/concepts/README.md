---
purpose: Concept index for OpenProse responsibilities and the Reactor reconciler
related:
  - ../responsibility-runtime.md
  - ../contract-markdown.md
  - ../forme.md
  - ../prose.md
---

# Concepts

Concept docs define semantic meaning for the intelligent VM. They are not
compiler sessions and they are not harness implementation docs.

## Contents

- `responsibility.md` -- the `kind: responsibility` contract: a mounted
  reactive node that maintains a standing truth (world-model) over time
- `reactor.md` -- the dumb run-phase reconciler: world-model = DOM,
  subscriptions = props, receipt = setState, fingerprint comparison decides
  wakes

## Loading Rule

Load `../responsibility-runtime.md` first for the stack and layer boundaries.
Then load only the concept file needed for the task.
