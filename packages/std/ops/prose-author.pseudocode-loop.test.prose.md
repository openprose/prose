---
name: test-prose-author-pseudocode-loop
kind: test
subject: prose-author
---

# Test Prose Author Pseudocode Loop

### Fixtures

- `request`: |
    input topic
    loop until **editor approves** (max: 5):
        session "research {{topic}}, address editor's prior notes"
        session "draft from research, revise per prior notes"
        session "review draft: approve as report or emit notes"
    return report

### Expects

- `source_package`: includes a runnable `kind: system` file
- `source_package`: maps `input topic` into a `### Requires` item named
  `topic`
- `source_package`: maps `return report` into a `### Ensures` item named
  `report`
- `source_package`: converts the three pseudo `session` steps into resolvable
  services or explicit dependencies for research, drafting, and review
- `source_package`: includes a fenced `prose` `### Execution` block with a
  bounded `loop until` and `max: 5`
- `source_package`: carries prior editor notes from the review step back into
  the next research and drafting round
- `source_package`: declares the exhausted-loop outcome when editor approval is
  not reached in five rounds
- `lint_report`: has status `pass` and no blocking findings

### Expects Not

- `source_package`: leaves standalone legacy-style `input topic` outside
  Contract Markdown sections
- `source_package`: leaves raw pseudo `session "..."` lines when they should be
  named services in the system graph
- `lint_report`: hides unbounded-loop or unresolved-service diagnostics behind
  warnings
