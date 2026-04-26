---
name: diagnose
kind: program
---

### Requires

- `run-path`: string - path to the failed or problematic run (e.g. `.prose/runs/20260408-...`)
- `focus`: string - focus area -- "graph", "node", "artifact", "policy", or "external" (optional, default: auto-detect)

### Ensures

- `report`: Markdown<Report> - diagnostic analysis with timeline, root cause, causal chain, and prioritized fix recommendations (immediate, permanent, prevention)


### Effects

- `read_external`: reads workspace, package, or run artifacts for operational analysis

### Errors

- no-run: run directory does not exist or is missing `run.json`
- malformed-run: run record, trace, artifact manifest, or node record cannot be parsed
- incomplete-run: run status is `running`, `queued`, or missing a terminal attempt

### Strategies

- read `run.json` for graph/component status, acceptance, caller, inputs, outputs, and runtime profile
- read `trace.json` for node lifecycle events, Pi session events, output submissions, retries, and approval gates
- read `artifact-manifest.json` when present to confirm file hashes, sizes, and runtime-owned artifacts
- examine `nodes/*.run.json` to find the first failed, rejected, blocked, or stale node
- examine `bindings/` and store artifact records for missing, malformed, or policy-labeled inputs and outputs
- inspect adjacent `.prose/store` or `.prose-store` attempts when available to distinguish retry, cancellation, and approval states
- classify the root cause by asking "why" iteratively until reaching the earliest intervention point
- propose concrete fixes: source-contract changes for program errors, approval/policy changes for gated effects, and operational changes for external failures
