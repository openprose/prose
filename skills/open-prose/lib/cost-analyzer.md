---
name: cost-analyzer
kind: program
services: [collector, analyzer, tracker]
---

requires:
- run-path: path to run, or "recent" for latest runs
- scope: "single" (one run), "compare" (multiple runs), or "trend" (over time)

ensures:
- report: cost analysis with breakdown by agent/phase, model tier efficiency, hotspots, and optimization recommendations
