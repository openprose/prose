---
description: Show recent OpenProse runs
---

Show the status of recent OpenProse runs.

This command is sugar for `prose run std/ops/status`. It:

1. **Lists** recent runs from `.prose/runs/`, sorted by recency
2. **Summarizes** each run: program name, timestamp, result (success/failure/interrupted)
3. **Highlights** any interrupted or failed runs that may need attention

For each run, displays the run ID, program name, start time, and final status from `state.md`.
