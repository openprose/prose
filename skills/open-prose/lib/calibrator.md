---
name: calibrator
kind: program
services: [sampler, comparator, statistician, advisor]
---

requires:
- run-paths: paths to runs to calibrate on (comma-separated list, or "recent" for the latest 10 runs)
- sample-size: maximum number of runs to analyze (default: 10)

ensures:
- report: calibration report containing agreement rates between light and deep evaluations, a disagreement analysis with categorized failure modes, and actionable recommendations for improving light evaluation reliability

errors:
- no-runs: none of the specified run paths exist or contain evaluation data
- insufficient-data: fewer than 3 runs with both light and deep evaluations available

strategies:
- when sample size exceeds available runs: use all available runs and note the reduced sample in the report
- when evaluations use different criteria across runs: normalize to common dimensions before comparison
- when agreement rate is very high (>95%): look for edge cases where light evaluations might be overconfident

invariants:
- every disagreement cited in the report references a specific run and evaluation pair
- agreement rates are computed from matched light/deep pairs only, never estimated

---

## sampler

requires:
- run-paths: paths to runs to calibrate on
- sample-size: maximum number of runs to analyze

ensures:
- sample: list of run paths that have both light and deep evaluation data, capped at sample-size

errors:
- no-runs: none of the specified run paths exist or contain evaluation data

strategies:
- when "recent" is specified: scan .prose/runs/ sorted by date descending
- when more runs available than sample-size: prefer runs with diverse outcomes (mix of pass/fail/partial)

---

## comparator

requires:
- sample: list of run paths with paired evaluations

ensures:
- pairs: for each run, the light evaluation verdict and deep evaluation verdict side-by-side, with per-dimension agreement flags

strategies:
- extract verdicts from both evaluation types and align them by evaluation dimension
- flag each dimension as agree/disagree with the specific values from each evaluation

---

## statistician

requires:
- pairs: paired light/deep evaluation data

ensures:
- statistics: overall agreement rate, per-dimension agreement rates, confusion matrix (light-pass/deep-fail, light-fail/deep-pass, etc.), and categorized disagreement patterns

strategies:
- compute Cohen's kappa or similar inter-rater reliability metric alongside raw agreement rate
- group disagreements by failure mode: overconfident-light, underconfident-light, dimension-mismatch, threshold-boundary

---

## advisor

requires:
- statistics: calibration statistics and disagreement patterns

ensures:
- report: final calibration report with agreement rates, disagreement analysis, and prioritized recommendations for improving light evaluation reliability

strategies:
- rank recommendations by expected impact on agreement rate
- distinguish between prompt-level fixes (changing evaluation criteria) and structural fixes (changing what light evaluation examines)
- if agreement is already high: recommend reducing deep evaluation frequency to save cost
