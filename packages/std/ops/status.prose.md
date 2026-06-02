---
name: status
kind: function
---

### Parameters

- runs_dir: (optional, default "<openprose-root>/runs/") path to the runs directory

### Returns

- summary: summary of recent runs showing run ID, system name, timestamp, duration, cost estimate, and pass/fail status, most recent runs first. If no run data is found in the runs directory, the call fails with `no-runs` rather than returning a summary.

### Errors

- no-runs: no run data found in the runs directory

### Execution

Orchestrate the status report as imperative calls inside this render, delegating to:

- scanner
- summarizer

Strategy:

- scan the runs directory for run folders, sorted by timestamp descending
- for each run, read the execution log to extract system name, duration, cost estimate, and final status
- present as a table with the most recent runs first
