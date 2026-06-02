---
name: diagnose
kind: function
---

### Parameters

- run-path: path to the failed or problematic run (e.g. `<openprose-root>/runs/20260408-...`)
- focus: focus area -- "host-runtime", "system", "context", or "external" (optional, default: auto-detect)

### Returns

- report: diagnostic analysis with timeline, root cause, causal chain, and prioritized fix recommendations (immediate, permanent, prevention). The returned report classifies the root cause down to the earliest intervention point and proposes concrete fixes — diffs for system errors, process changes for external errors.

### Errors

- no-run: run directory does not exist or is missing vm.log.md
- incomplete-run: run is still in progress (no `---end` or `---error` marker)

### Execution

Orchestrate the diagnosis by calling the investigator, classifier, and fixer in turn:

- `call investigator` to read the run's `vm.log.md` execution log and identify the failure point from event markers; examine `workspace/` directories for `__error.md` files and intermediate artifacts, and `bindings/` directories for missing or malformed outputs.
- `call classifier` to read `sources/*.prose.md` service definitions to understand what each service was supposed to do, read `root.prose.md` (the root source snapshot) to understand the system's intent, and classify the root cause by asking "why" iteratively until reaching the earliest intervention point.
- `call fixer` to propose concrete fixes: show diffs for system errors, describe process changes for external errors.
