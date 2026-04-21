---
name: profiler
kind: program
---

### Services

- detector
- collector
- calculator
- analyzer
- tracker

### Requires

- run-path: path to run, or "recent" for latest runs
- scope: "single" (one run), "compare" (multiple runs), or "trend" (over time)

### Ensures

- report: profiling report with cost attribution, time attribution, per-agent breakdown, cache efficiency, hotspots, and optimization recommendations

### Errors

- no-data: could not find session data for this run

### Strategies

- detect the AI coding tool used (Claude Code, OpenCode, Amp, Codex) by checking for session directories (~/.claude/projects/, etc.)
- locate the tool's session files (jsonl logs) corresponding to the run's timestamp
- extract actual token counts, model identifiers, and timestamps from assistant messages in session logs -- never estimate from content length
- fetch live pricing from the Anthropic pricing page rather than using hardcoded rates
- calculate all metrics via inline Python scripts -- never do arithmetic in natural language
- attribute costs and time separately for VM orchestration vs subagent sessions
- for scope=compare, diff metrics across runs; for scope=trend, show progression over time
