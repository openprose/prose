---
name: test-prose-author-release-readiness
kind: test
version: 0.15.0
subject: prose-author
---

# Test Prose Author Release Readiness

### Fixtures

- `output_mode`: source-package-only
- `apply`: false
- `request`: Write a folder-shaped OpenProse package from this rough brief:
  "Keep release candidates ready before ship day. Every weekday, collect CI
  status, changelog notes, rollback context, and unresolved blocker signals.
  Produce a release readiness brief and a durable decision record. Human
  approval is required before marking a release ready."

### Expects

- `source_package`: includes a folder file tree with at least one
  `kind: responsibility` file, one `kind: gateway` file, and one
  `kind: function` file
- `source_package`: every generated program file path ends in `.prose.md`
- `source_package`: every generated `kind: responsibility` file includes
  `### Goal`, `### Continuity`, `### Maintains`, `### Invariants`, and
  `### Tools`
- `source_package`: the generated orchestrating `kind: function` has a
  non-empty `### Execution` section whose ProseScript `call`s reach every
  local unit it composes, and each such unit is present in the package
- `lint_report`: has status `pass` and no blocking findings
- `authoring_notes`: names the assumptions made while translating the rough
  brief into Contract Markdown
- `authoring_notes`: includes the local landscape facts, chosen shape/root
  decision, and targeted guidance loaded before source authoring
- `source_package`: includes file contents and apply notes but does not claim
  generated files were written to the repository

### Expects Not

- `authoring_notes`: claims this authoring run created or modified repository
  files
- `source_package`: includes raw secret values or API keys
- `source_package`: uses bare `owner/repo` dependency references
- `lint_report`: hides unresolved blocking diagnostics behind warnings
