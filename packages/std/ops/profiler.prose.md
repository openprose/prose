---
name: profiler
kind: program
---

### Requires

- `run-path`: string - path to run, or "recent" for latest runs
- `scope`: string - "single" (one run), "compare" (multiple runs), or "trend" (over time)
- `store-root`: string - (optional) local store root for attempts and artifact records

### Ensures

- `report`: Markdown<Report> - profiling report with graph/node duration, retry count, model usage, token and cost telemetry when available, artifact volume, cache/recompute notes, hotspots, and optimization recommendations


### Effects

- `read_external`: reads workspace, package, or run artifacts for operational analysis

### Errors

- no-run: run directory does not exist or is missing `run.json`
- no-trace: trace data is unavailable for the requested run
- no-telemetry: trace exists but contains no usage, duration, or model telemetry

### Strategies

- read `run.json`, `trace.json`, `artifact-manifest.json`, `nodes/*.run.json`, and store attempt records when available
- attribute time by graph node and attempt using explicit timestamps and durations only
- extract model provider, model id, session ids, token usage, and cost only from structured trace events or artifact metadata
- mark usage or cost as unavailable when telemetry is absent; never estimate tokens from content length
- compare materialized nodes with the plan/recompute story to identify avoided work and stale hotspots
- report artifact byte volume by input, output, runtime log, and trace artifacts when manifests are present
- for scope=compare, diff metrics across runs; for scope=trend, show progression over time
