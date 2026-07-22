---
name: status-check
kind: program
services: [scanner, summarizer]
---

requires:
- runs_dir: (optional, default ".prose/runs/") path to the runs directory

ensures:
- summary: summary of recent runs

errors:
- no-runs: no run data found

strategies:
- scan the runs directory for run folders, sorted by timestamp descending
