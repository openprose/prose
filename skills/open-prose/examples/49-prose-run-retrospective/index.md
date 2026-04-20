---
name: prose-run-retrospective
kind: program
---

### Services

- `analyst`
- `extractor`

### Requires

- `run-id`: path to the completed run directory
- `prose-path`: path to the .prose file that was executed

### Ensures

- `result`: classification, improvements, improved .prose file, and any new patterns/antipatterns
- if transient error: recommendation to re-run with no structural changes needed
