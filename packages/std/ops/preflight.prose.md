---
name: preflight
kind: system
---

### Services

- resolver
- env-checker
- dep-checker

### Requires

- target: path to the system `*.prose.md` file to preflight

### Ensures

- report: preflight report listing dependency installation status and environment variable status (set/not set, never revealing values)

### Errors

- not-found: target file does not exist
- not-system: target file is not a valid system

### Strategies

- resolve all services transitively from the system's `### Services` section
- collect all `environment:` declarations across the service tree
- check each env var with `test -n "${VAR+x}"` via Bash — this returns whether the variable exists without ever reading its value. Never log, print, or include environment variable values in any output
- check that all `use` dependencies are installed in `.agents/prose/deps/`
- report readiness as pass (all satisfied) or fail (with missing items listed)
