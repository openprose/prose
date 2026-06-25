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

- detect the AI coding tool used (Claude Code, OpenCode, Amp, Codex) by checking for session directories (~/.claude/projects/, etc.)
- locate the tool's session files (jsonl logs) corresponding to the run's timestamp
- extract actual token counts, model identifiers, and timestamps from assistant messages in session logs -- never estimate from content length
- fetch live pricing from the Anthropic pricing page rather than using hardcoded rates
- calculate all metrics via inline Python scripts -- never do arithmetic in natural language
- attribute costs and time separately for VM orchestration vs subagent sessions
- for scope=compare, diff metrics across runs; for scope=trend, show progression over time
