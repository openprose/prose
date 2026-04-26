---
name: status
kind: program
---

### Requires

- `runs_dir`: string - (optional, default ".prose/runs/") path to the run directory root or a local store root
- `limit`: number - (optional, default 10) maximum number of runs to include

### Ensures

- `summary`: Markdown<Summary> - summary of recent materialized runs showing run ID, component, kind, status, acceptance, outputs, node count, attempts, timestamps, and run path


### Effects

- `read_external`: reads workspace, package, or run artifacts for operational analysis

### Errors

- no-runs: no run data found in the runs directory

### Strategies

- when the path is a local store root, read the run index and attempt records
- when the path is a run directory root, scan child run folders sorted by creation time descending
- for each run, read `run.json` and count `nodes/*.run.json` where available
- include latest attempt status when store records exist
- do not estimate cost unless trace telemetry includes explicit usage or cost fields
- present as a table with the most recent runs first
