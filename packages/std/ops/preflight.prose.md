---
name: preflight
kind: program
---

### Services

- resolver
- env-checker
- dep-checker

### Requires

- `target`: string - path to the program `.prose.md` file to preflight

### Ensures

- `report`: Markdown<Report> - preflight report listing dependency installation status and environment variable status (set/not set, never revealing values)


### Effects

- `read_external`: reads workspace, package, or run artifacts for operational analysis

### Errors

- not-found: target file does not exist
- not-program: target file is not a valid program

### Strategies

- resolve all services transitively from the program's `services:` list
- collect all `environment:` declarations across the service tree
- check each env var with `test -n "${VAR+x}"` via Bash — this returns whether the variable exists without ever reading its value. Never log, print, or include environment variable values in any output
- check that all `use` dependencies are installed in `.deps/`
- report readiness as pass (all satisfied) or fail (with missing items listed)
