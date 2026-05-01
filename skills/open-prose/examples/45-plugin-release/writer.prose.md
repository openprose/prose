---
name: writer
kind: service
---

### Requires

- `task`: what to write (changelog, release notes, commit message)
- `version`: the release version
- `impact`: categorized change analysis

### Ensures

- `content`: release documentation with user-visible changes, migration notes, known risks, and format-specific fields
