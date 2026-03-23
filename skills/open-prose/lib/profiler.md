---
name: profiler
kind: program
services: [detector, collector, calculator, analyzer, tracker]
---

requires:
- run-path: path to run, or "recent" for latest runs
- scope: "single" (one run), "compare" (multiple runs), or "trend" (over time)

ensures:
- report: profiling report with cost attribution, time attribution, per-agent breakdown, cache efficiency, hotspots, and optimization recommendations

errors:
- no-data: could not find session data for this run
