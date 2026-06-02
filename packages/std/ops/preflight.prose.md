---
name: preflight
kind: function
---

### Goal

Report the dependency-installation and environment-variable readiness of a target `*.prose.md` contract before it is run.

### Parameters

- target: path to the `*.prose.md` file to preflight

### Returns

- report: preflight report listing dependency installation status and environment variable status (set/not set, never revealing values). The report reads `pass` when every `use` dependency is installed and every declared environment variable is set, and `fail` (with the missing items listed) otherwise.

### Errors

- not-found: target file does not exist
- not-system: target file is not a valid contract to preflight

### Invariants

- Never log, print, or include environment variable values in any output — only their set/not-set status.

### Execution

- Resolve the full set of contracts the target depends on, transitively, from the target's declared dependencies (the resolver).
- Collect all `environment:` declarations across the resolved contract tree (the env-checker).
- Check each env var with `test -n "${VAR+x}"` via Bash — this returns whether the variable exists without ever reading its value.
- Check that all `use` dependencies are installed in `<openprose-root>/deps/` (the dep-checker).
- Report readiness as `pass` (all satisfied) or `fail` (with missing items listed).
