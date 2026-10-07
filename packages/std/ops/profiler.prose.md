---
name: profiler
kind: function
version: 0.15.0
---

### Goal

Profile one or more runs and return a cost/time attribution report from real session data.

### Parameters

- run-path: path to run, or "recent" for latest runs
- scope: "single" (one run), "compare" (multiple runs), or "trend" (over time)

### Returns

- report: profiling report with cost attribution, time attribution, per-agent breakdown, cache efficiency, hotspots, and optimization recommendations. The returned report is computed only from real session data; if no session data can be found for the run, the call fails with `no-data` rather than returning a report.

### Shape

- `self`: inspect only the caller-selected run and the minimum session metadata needed to attribute that run
- `prohibited`: do not scan unrelated projects or home-directory files; do not read credentials, environment files, private keys, or raw conversation content; do not copy prompts or message bodies into the report; do not access a session log unless its ownership and association with `run-path` can be verified

### Errors

- no-data: could not find session data for this run

### Execution

Orchestrate the profiling as imperative calls inside this render, delegating to:

- detector
- collector
- calculator
- analyzer
- tracker

Strategy:

- detect the AI coding tool used from the caller-selected run metadata or an
  explicitly provided tool path; do not enumerate home-directory session
  trees merely to discover candidates
- locate only the tool's session files (jsonl logs) whose ownership and run association can be verified; if that cannot be established without broad filesystem scanning, fail with `no-data`
- extract actual token counts, model identifiers, and timestamps from assistant messages in session logs -- never estimate from content length
- retain only aggregate metadata; never persist raw prompts, responses, file contents, credentials, or unrelated session identifiers
- fetch live pricing from the Anthropic pricing page rather than using hardcoded rates
- calculate all metrics via inline Python scripts -- never do arithmetic in natural language
- attribute costs and time separately for VM orchestration vs subagent sessions
- for scope=compare, diff metrics across runs; for scope=trend, show progression over time
