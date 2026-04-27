---
name: preflight
kind: program
---

### Requires

- `target`: string - path to the program `.prose.md` file to preflight

### Ensures

- `report`: Markdown<Report> - preflight report listing dependency installation status and environment variable status (set/not set, never revealing values)

### Errors

- not-found: target file does not exist
- not-program: target file is not a valid program

### Effects

- `read_external`: reads workspace, package, or run artifacts for operational analysis

### Strategies

- compile the target and package scope into canonical Prose IR
- resolve referenced components from the program's `Services` section across the package scope
- collect all required and optional `Environment` declarations from referenced components
- check only whether required environment names are present; never read, log, print, or include values
- check that pinned dependencies are present in `prose.lock` and installed under `.deps/`
- report readiness as pass (all satisfied) or fail (with missing items listed)
