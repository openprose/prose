---
name: calibrator
kind: program
services: [sampler, comparator, statistician, advisor]
---

requires:
- runs: run[]

ensures:
- report: calibration report containing agreement rates between light and deep evaluations, a disagreement analysis with categorized failure modes, and actionable recommendations for improving light evaluation reliability

errors:
- insufficient-data: fewer than 3 runs with both light and deep evaluations available

strategies:
- when evaluations use different criteria across runs: normalize to common dimensions before comparison
- when agreement rate is very high (>95%): look for edge cases where light evaluations might be overconfident

invariants:
- every disagreement cited in the report references a specific run and evaluation pair
- agreement rates are computed from matched light/deep pairs only, never estimated

---

## sampler

requires:
- runs: run[]

ensures:
- sample: list of runs that have both light and deep evaluation data

strategies:
- prefer runs with diverse outcomes (mix of pass/fail/partial) when the provided set is large

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
