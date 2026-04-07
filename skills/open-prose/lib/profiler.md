---
name: profiler
kind: program
services: [detector, collector, calculator, analyzer, tracker]
---

requires:
- runs: run[]
- scope: analysis scope -- "single" (exactly one run in the list), "compare" (multiple runs side-by-side), or "trend" (patterns over time)

ensures:
- report: profiling report with cost attribution per agent, time attribution per phase, per-agent token breakdown (input/output/cache), cache efficiency metrics, identified hotspots, and optimization recommendations

errors:
- no-data: could not find session data for the specified run(s)
- incomplete-run: run exists but is missing timing or session data for some services

strategies:
- when comparing runs: normalize metrics by program complexity to enable fair comparison
- when session data is partial: report what is available and clearly mark gaps
- prioritize optimization recommendations by estimated impact (cost savings or time reduction)

invariants:
- all metrics trace back to actual session/API data, never estimated
- cost and time totals equal the sum of their per-agent components
- cache efficiency is reported as a ratio, not an absolute number

---

## detector

requires:
- runs: run[]
- scope: analysis scope

ensures:
- validated-runs: validated list of runs to profile, with confirmation that each contains session data

errors:
- no-data: could not find session data for the specified run(s)

strategies:
- validate each run has the expected structure before including it
- for "single" scope: expect exactly one run in the list

---

## collector

requires:
- runs: validated list of run directories

ensures:
- raw-data: per-session records including agent name, model, input tokens, output tokens, cache hits, start time, end time, and any error markers

errors:
- incomplete-run: some sessions lack timing or token data

strategies:
- extract data from session logs, API response metadata, and state.md timestamps
- preserve raw values without transformation for downstream calculation

---

## calculator

requires:
- raw-data: per-session records with token and timing data

ensures:
- metrics: computed metrics including cost per agent (using model-specific pricing), wall-clock time per agent, context utilization ratio, cache hit rate per agent, and tokens-per-output-token efficiency

strategies:
- use standard token pricing tiers for cost calculation
- compute wall-clock time from session start/end timestamps
- calculate context utilization as (tokens used / context window size) per session

---

## analyzer

requires:
- metrics: computed per-agent metrics

ensures:
- analysis: identified hotspots (agents consuming disproportionate cost or time), efficiency ratings per agent, cross-run comparisons (for compare/trend scopes), and patterns or anomalies

strategies:
- flag hotspots: any agent using >40% of total cost or >50% of total time
- for trend scope: detect cost/time trajectories (increasing, stable, decreasing)
- look for anomalies: cache efficiency drops, unusual token ratios, timeout patterns

---

## tracker

requires:
- analysis: hotspot and efficiency analysis

ensures:
- report: final profiling report with formatted tables, hotspot highlights, comparison charts (for compare scope), trend lines (for trend scope), and ranked optimization recommendations

strategies:
- format all costs in both tokens and estimated USD
- rank recommendations by estimated impact
- include specific actionable steps (e.g., "switch agent X to model Y to save Z tokens per run")
