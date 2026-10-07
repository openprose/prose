---
name: profiler
kind: function
version: 0.15.0
---

### Goal

Profile one or more runs and return a cost/time attribution report from real session data.

### Parameters

- run-path: path to a run under the configured OpenProse root, or "recent" for
  the latest run metadata under that root
- scope: "single" (one run), "compare" (multiple runs), or "trend" (over time)

### Returns

- report: profiling report with cost attribution, time attribution, per-agent breakdown, cache efficiency, hotspots, and optimization recommendations. The returned report is computed only from real session data; if no session data can be found for the run, the call fails with `no-data` rather than returning a report.

### Errors

- no-data: could not find session data for this run
- invalid-run-path: the requested path is not a run directory under the configured
  OpenProse root

### Invariants

- Read only the caller-supplied run directory and declared OpenProse state files;
  never discover or crawl home-directory agent stores such as `~/.claude`,
  `~/.codex`, `~/.cursor`, or `~/.aider`.
- Never read, infer, log, or serialize secrets, credentials, environment-variable
  values, prompt bodies, or transcript content that is not required by the
  requested run-level metrics.
- Do not make network requests or execute generated code. Pricing is reported
  only when it is already present in the run metadata; otherwise the report
  marks pricing as unavailable.

### Execution

Orchestrate the profiling as imperative calls inside this render, delegating to:

- detector
- collector
- calculator
- analyzer
- tracker

Strategy:

- identify session data only from the caller-supplied run directory and its
  declared, already-linked artifacts; do not enumerate unrelated tool stores
- extract only the minimum structured usage fields needed for this run's report;
  never ingest complete prompts, responses, or arbitrary JSONL files
- use pricing embedded in the run metadata when available; never fetch live
  pricing during profiling
- calculate metrics with the host's structured data facilities or a delegated
  calculator result; never generate or execute shell/Python/JavaScript code
- attribute costs and time separately for VM orchestration vs subagent sessions
- for scope=compare, diff metrics across runs; for scope=trend, show progression over time
