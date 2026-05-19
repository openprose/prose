---
name: test-prose-author-release-readiness
kind: test
subject: prose-author
---

# Test Prose Author Release Readiness

### Fixtures

- `request`: Write a folder-shaped OpenProse package from this rough brief:
  "Keep release candidates ready before ship day. Every weekday, collect CI
  status, changelog notes, rollback context, and unresolved blocker signals.
  Produce a release readiness brief and a durable decision record. Human
  approval is required before marking a release ready."

### Expects

- `source_package`: includes a folder file tree with at least one
  `kind: responsibility` file, one `kind: gateway` file, and one
  `kind: system` file
- `source_package`: every generated program file path ends in `.prose.md`
- `source_package`: every generated `kind: responsibility` file includes
  `### Goal`, `### Continuity`, `### Criteria`, `### Constraints`, and
  `### Tools`
- `source_package`: the generated system has a non-empty `### Services`
  section and every local service listed there is present in the package
- `lint_report`: has status `pass` and no blocking findings
- `authoring_notes`: names the assumptions made while translating the rough
  brief into Contract Markdown
- `authoring_notes`: includes the local landscape facts, chosen shape/root
  decision, and targeted guidance loaded before source authoring

### Expects Not

- `source_package`: includes raw secret values or API keys
- `source_package`: uses bare `owner/repo` dependency references
- `lint_report`: hides unresolved blocking diagnostics behind warnings
