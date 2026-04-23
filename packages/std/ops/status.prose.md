---
name: status
kind: program
---

### Services

- scanner
- summarizer

### Requires

- runs_dir: (optional, default ".prose/runs/") path to the runs directory

### Ensures

- summary: summary of recent runs showing run ID, program name, timestamp, duration, cost estimate, and pass/fail status

### Errors

- no-runs: no run data found in the runs directory

### Strategies

- scan the runs directory for run folders, sorted by timestamp descending
- for each run, read the execution log to extract program name, duration, cost estimate, and final status
- present as a table with the most recent runs first
