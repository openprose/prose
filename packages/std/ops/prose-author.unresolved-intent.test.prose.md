---
name: test-prose-author-unresolved-intent
kind: test
subject: prose-author
---

# Test Prose Author Unresolved Intent

### Fixtures

- `request`: |
    Make the right Prose agent for this repository and put it where it belongs.
    It should remember what matters and handle the team's workflow.

### Expects

- `lint_report`: does not report a passing package when root, persistence, and
  workflow shape are still unsafe to infer
- `authoring_notes`: names the missing decisions needed for a safe follow-up
  single-shot request, including target root, desired workflow, and persistence
  scope
- `authoring_notes`: explains that the shell CLI cannot pause mid-run for
  those answers
- `authoring_notes`: preserves the read-only landscape facts that were used to
  decide the request remained underspecified

### Expects Not

- `source_package`: invents a user-global agent or sidecar root without request
  support
- `source_package`: writes a vague placeholder workflow and claims validation
  passed
