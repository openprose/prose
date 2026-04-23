---
name: eval-calibrator
kind: program
---

# Eval Calibrator

Validate that light inspections reliably predict deep inspection outcomes. This is the meta-eval — it measures whether the fast, cheap eval (light) is a trustworthy proxy for the thorough, expensive eval (deep). If light and deep agree consistently, teams can use light inspections in CI and reserve deep inspections for investigation.

### Services

- sampler
- runner
- comparator
- statistician
- advisor

### Requires

- subjects: run[] — completed runs to calibrate on (minimum 3, recommended 10+)

### Ensures

- report: calibration report containing:
    - sample_size: number of runs analyzed
    - agreement_rate: percentage of runs where light and deep verdicts match (pass/partial/fail)
    - score_correlation: Pearson correlation between light and deep scores for runtime_fidelity and task_effectiveness
    - disagreements: list of runs where light and deep diverged, each with both verdicts, both scores, and the nature of the disagreement
    - bias_direction: whether light tends to be optimistic (scores higher than deep) or pessimistic (scores lower) or neutral
    - confidence: "high" (20+ runs, agreement > 90%), "medium" (10+ runs, agreement > 75%), or "low" (fewer runs or lower agreement)
    - recommendations: prioritized list of improvements to light eval criteria based on disagreement patterns

### Errors

- insufficient-runs: fewer than 3 runs provided
- homogeneous-sample: all runs are from the same program (calibration requires diversity)

### Invariants

- all statistical calculations are performed deterministically via code execution, never by LLM arithmetic
- every run in the sample receives both a light and deep inspection — no run is skipped

### Strategies

- when sample is small (3-5 runs): lower confidence accordingly, note that results are preliminary
- when all runs agree: still report the result but flag that adversarial or edge-case runs would strengthen the calibration
- when disagreements cluster around a specific failure mode: highlight that mode as the priority improvement target

---

## sampler

Select and validate the sample of runs for calibration. Ensure diversity across programs, outcomes, and complexity.

### Requires

- subjects: the run[] binding from the caller

### Ensures

- sample: validated list of run paths with metadata (program name, completion status, service count) sorted by diversity score
- sample-stats: summary of sample composition (programs represented, success/failure ratio, size distribution)

### Errors

- insufficient-runs: fewer than 3 valid runs in the input
- homogeneous-sample: all runs are from the same program

### Strategies

- when more runs are provided than needed: prefer a diverse subset — different programs, mix of pass/fail, different sizes
- when validating: confirm each run has state.md, program.md, and at least one binding

---

## runner

Execute the inspector on each sampled run at both depths. This service composes `std/evals/inspector` — it does not re-implement inspection logic.

### Shape

- `self`:
  - invoke inspector at both depths for each run
  - collect results
- `delegates`:
  - `inspector`: perform the actual inspection
- `prohibited`:
  - performing inspection logic directly
  - judging run quality


### Requires

- sample: validated run list from sampler

### Ensures

- inspections: for each run in the sample, a pair of inspection results — one from `depth: light` and one from `depth: deep`
- each inspection pair has: run_id, light_inspection (full inspector output), deep_inspection (full inspector output)

### Errors

- inspector-failed: the inspector program itself failed on one or more runs (include which runs and why)

### Strategies

- for each run: invoke `std/evals/inspector` with `depth: light`, then invoke again with `depth: deep`
- if inspector fails on a run: record the failure, continue to next run, report partial results
- do not attempt to inspect a run and its inspection simultaneously — sequential per run, parallel across runs if possible

---

## comparator

Compare light and deep inspection results for each run. Identify agreements, disagreements, and patterns.

### Requires

- inspections: paired light/deep results from runner

### Ensures

- comparisons: for each run, a structured comparison containing:
    - run_id: string
    - verdict_match: boolean (light verdict == deep verdict)
    - runtime_fidelity_delta: deep score minus light score (positive means light underestimated)
    - task_effectiveness_delta: deep score minus light score
    - flag_overlap: flags found by both, flags found only by light, flags found only by deep
    - disagreement_type: null if agree, or one of "false_positive" (light flagged, deep did not), "false_negative" (light missed, deep caught), "severity_mismatch" (same flag, different severity), "verdict_split" (different verdict category)
    - notes: explanation of significant differences

### Strategies

- when scores differ by less than 10 points but verdicts match: classify as agreement with minor calibration noise
- when verdicts differ: always classify as disagreement regardless of score proximity
- when light finds flags that deep does not: this is a false positive — note it but recognize it may indicate light is being overly cautious (not necessarily bad)

---

## statistician

Compute aggregate statistics from the comparisons. All calculations must be performed via code execution — never by LLM arithmetic.

### Shape

- `self`: compute statistics using code execution
- `prohibited`:
  - performing arithmetic mentally
  - estimating correlations without calculation


### Requires

- comparisons: per-run comparison data from comparator

### Ensures

- statistics: computed metrics containing:
    - agreement_rate: percentage of verdict matches (with 95% confidence interval)
    - score_correlation: Pearson r for runtime_fidelity scores and task_effectiveness scores between light and deep
    - mean_score_delta: average (deep - light) for each score type
    - bias_direction: "optimistic" if mean delta < -5 (light scores higher), "pessimistic" if > 5, "neutral" otherwise
    - disagreement_breakdown: count by disagreement_type
    - confidence_level: "high", "medium", or "low" per the program's ensures criteria

### Errors

- computation-failed: code execution failed (include the error)

### Strategies

- when computing correlation with fewer than 5 points: report "insufficient data for correlation" instead of a misleading r value
- when computing confidence intervals: use Wilson score interval for proportions, not the normal approximation
- always show your work: include the raw numbers alongside computed statistics

---

## advisor

Analyze disagreement patterns and recommend improvements to the light evaluation criteria.

### Requires

- comparisons: from comparator
- statistics: from statistician

### Ensures

- recommendations: prioritized list of improvements, each with:
    - priority: 1 (highest) through N
    - target: which aspect of light eval to change
    - rationale: what disagreement pattern motivates this
    - proposed_change: specific description of what to adjust
    - expected_impact: how much this would improve agreement rate

### Strategies

- when agreement is high (> 90%): recommendations should focus on edge cases and maintaining reliability
- when agreement is low (< 75%): recommendations should focus on the most common disagreement type first
- when light is consistently optimistic: recommend adding specific structural checks that catch the issues deep finds
- when light is consistently pessimistic: recommend relaxing specific criteria that trigger false positives
