---
name: diagnose
kind: system
---

### Services

- investigator
- classifier
- fixer

### Requires

- run-path: path to the failed or problematic run (e.g. `<openprose-root>/runs/20260408-...`)
- focus: focus area -- "host-runtime", "system", "context", or "external" (optional, default: auto-detect)

### Ensures

- report: diagnostic analysis with timeline, root cause, causal chain, and prioritized fix recommendations (immediate, permanent, prevention)

### Errors

- no-run: run directory does not exist or is missing vm.log.md
- incomplete-run: run is still in progress (no `---end` or `---error` marker)

### Strategies

- read the run's `vm.log.md` execution log to identify the failure point from event markers
- examine `workspace/` directories for `__error.md` files and intermediate artifacts
- examine `bindings/` directories for missing or malformed outputs
- read `sources/*.prose.md` service definitions to understand what each service was supposed to do
- read `root.prose.md` (the root source snapshot) to understand the system's intent
- classify the root cause by asking "why" iteratively until reaching the earliest intervention point
- propose concrete fixes: show diffs for system errors, describe process changes for external errors
