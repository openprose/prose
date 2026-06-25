---
name: test-prose-author-pseudocode-loop
kind: test
version: 0.15.0
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

- `source_package`: includes a runnable `kind: function` file
- `source_package`: maps `input topic` into a `### Parameters` item named
  `topic`
- `source_package`: maps `return report` into a `### Returns` item named
  `report`
- `source_package`: converts the three pseudo `session` steps into intra-node
  sub-agent sessions or delegated `function` calls for research, drafting, and
  review
- `source_package`: includes a fenced `prose` `### Execution` block with a
  bounded `loop until` and `max: 5`
- `authoring_notes`: records that `prosescript.md` was loaded because the
  request requires bounded imperative choreography
- `source_package`: carries prior editor notes from the review step back into
  the next research and drafting round
- `source_package`: declares the exhausted-loop outcome when editor approval is
  not reached in five rounds
- `lint_report`: has status `pass` and no blocking findings

### Expects Not

- `source_package`: leaves standalone legacy-style `input topic` outside
  Contract Markdown sections
- `source_package`: leaves raw pseudo `session "..."` lines when they should be
  intra-node sub-agent sessions in `### Execution`
- `lint_report`: hides unbounded-loop or unresolved-call diagnostics behind
  warnings
