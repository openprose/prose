---
name: prose-run-retrospective
kind: system
---

### Services

- `analyst`
- `extractor`

### Requires

- `run-id`: path to the completed run directory
- `prose-path`: path to the `*.prose.md` source file that was executed

### Ensures

- `result`: classification, improvements, improved `*.prose.md` source file, and any new patterns/antipatterns
- if transient error: recommendation to re-run with no structural changes needed
