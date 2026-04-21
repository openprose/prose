---
name: diagnose
kind: program
---

### Services

- investigator
- classifier
- fixer

### Requires

- run-path: path to the failed or problematic run (e.g. `.prose/runs/20260408-...`)
- focus: focus area -- "vm", "program", "context", or "external" (optional, default: auto-detect)

### Ensures

- report: diagnostic analysis with timeline, root cause, causal chain, and prioritized fix recommendations (immediate, permanent, prevention)

### Errors

- no-run: run directory does not exist or is missing state.md
- incomplete-run: run is still in progress (no `---end` or `---error` marker)

### Strategies

- read the run's `state.md` execution log to identify the failure point from event markers
- examine `workspace/` directories for `__error.md` files and intermediate artifacts
- examine `bindings/` directories for missing or malformed outputs
- read `services/*.md` component definitions to understand what each service was supposed to do
- read `program.md` (the entry point snapshot) to understand the program's intent
- classify the root cause by asking "why" iteratively until reaching the earliest intervention point
- propose concrete fixes: show diffs for program errors, describe process changes for external errors
