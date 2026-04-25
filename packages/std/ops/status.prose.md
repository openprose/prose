---
name: status
kind: program
---

### Services

- scanner
- summarizer

### Requires

- `runs_dir`: string - (optional, default ".prose/runs/") path to the runs directory

### Ensures

- `summary`: Markdown<Summary> - summary of recent runs showing run ID, program name, timestamp, duration, cost estimate, and pass/fail status


### Effects

- `read_external`: reads workspace, package, or run artifacts for operational analysis

### Errors

- no-runs: no run data found in the runs directory

### Strategies

- scan the runs directory for run folders, sorted by timestamp descending
- for each run, read the execution log to extract program name, duration, cost estimate, and final status
- present as a table with the most recent runs first
