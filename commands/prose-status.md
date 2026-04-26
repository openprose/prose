---
description: Show recent OpenProse runs
---

Show the status of recent OpenProse runs.

Use:

```bash
bun run prose status .prose/runs
```

It:

1. **Lists** recent runs from `.prose/runs/`, sorted by recency
2. **Summarizes** each run: program name, timestamp, result (success/failure/interrupted)
3. **Highlights** any interrupted or failed runs that may need attention

For each run, displays the run ID, component or graph name, start time, final
status, acceptance, and runtime profile.
