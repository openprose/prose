---
name: lint
kind: program
---

### Requires

- `target`: string - path to the program `.prose.md` file to lint

### Ensures

- `report`: Markdown<Report> - structured lint report with file-level validation results, contract compatibility checks, shape consistency checks, and warnings

### Errors

- not-found: target file does not exist
- not-program: target file is not a valid program (missing or invalid `kind`)

### Effects

- `read_external`: reads workspace, package, or run artifacts for operational analysis

### Strategies

- compile the target and its package scope into canonical Prose IR
- validate frontmatter, component kind, section spelling, duplicate sections, and canonical section order
- check that component references in `Services` sections resolve within the package scope
- flag non-canonical executable source that does not use `.prose.md`
- report diagnostics with file, line, severity, code, and actionable message
