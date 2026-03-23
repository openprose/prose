---
name: calibrator
kind: program
services: [sampler, comparator, statistician, advisor]
---

requires:
- run-paths: paths to runs to calibrate on (comma-separated or "recent")
- sample-size: max runs to analyze (default: 10)

ensures:
- report: calibration report with agreement rates, disagreement analysis, and recommendations for improving light evaluation reliability
