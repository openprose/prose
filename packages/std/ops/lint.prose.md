---
name: lint
kind: system
---

### Services

- resolver
- validator
- checker

### Requires

- target: path to the system `*.prose.md` file to lint

### Ensures

- report: structured lint report with file-level validation results, contract matching checks, shape consistency checks, and warnings

### Errors

- not-found: target file does not exist
- not-system: target file is not a valid system (missing or invalid `kind`)

### Strategies

- recursively resolve all services declared in the system's `### Services` section, following nested service trees
- validate each file's frontmatter against the OpenProse schema — valid `kind`, valid contract sections, valid shape structure
- check that all services referenced in `### Services` sections exist as files
- verify that shape `delegates` entries reference known services
- attempt basic contract matching — does each service's `requires` have a plausible match in another service's `ensures`
