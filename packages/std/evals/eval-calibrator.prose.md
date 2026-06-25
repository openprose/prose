---
name: eval-calibrator
kind: function
version: 0.15.0
---

# Eval Calibrator

Validate that light inspections reliably predict deep inspection outcomes. This is the meta-eval — it measures whether the fast, cheap eval (light) is a trustworthy proxy for the thorough, expensive eval (deep). If light and deep agree consistently, teams can use light inspections in CI and reserve deep inspections for investigation.

### Parameters

- subjects: run[] — completed runs to calibrate on (minimum 3, recommended 10+)

### Returns

- report: calibration report containing:
    - sample_size: number of runs analyzed
    - agreement_rate: percentage of runs where light and deep verdicts match (pass/partial/fail)
    - score_correlation: Pearson correlation between light and deep scores for runtime_fidelity and task_effectiveness
    - disagreements: list of runs where light and deep diverged, each with both verdicts, both scores, and the nature of the disagreement
    - bias_direction: whether light tends to be optimistic (scores higher than deep) or pessimistic (scores lower) or neutral
    - confidence: "high" (20+ runs, agreement > 90%), "medium" (10+ runs, agreement > 75%), or "low" (fewer runs or lower agreement)
    - recommendations: prioritized list of improvements to light eval criteria based on disagreement patterns

The returned report is well-formed only when every run in the sample received both a light and a deep inspection (none skipped); when the confidence field reflects the sample size and agreement rate per the thresholds above; and when, for a small sample (3-5 runs), confidence is lowered accordingly and the results are noted as preliminary. When all runs agree, the report still reports the result but flags that adversarial or edge-case runs would strengthen the calibration. When disagreements cluster around a specific failure mode, that mode is highlighted as the priority improvement target.

### Errors

- insufficient-runs: fewer than 3 runs provided
- homogeneous-sample: all runs are from the same system (calibration requires diversity)

### Invariants

- all statistical calculations are performed deterministically via code execution, never by LLM arithmetic
- every run in the sample receives both a light and deep inspection — no run is skipped

### Execution

The render orchestrates five internal stages, in order. Each stage is an internal step in producing the report — none is a node; the only cross-contract call is the `std/evals/inspector` invocation inside the runner stage.

1. **sampler** — Select and validate the sample of runs for calibration, ensuring diversity across systems, outcomes, and complexity. Takes the `subjects` run[] and produces a validated list of run paths with metadata (system name, completion status, service count) sorted by diversity score, plus a summary of sample composition (systems represented, success/failure ratio, size distribution). Raise `insufficient-runs` if fewer than 3 valid runs are in the input, or `homogeneous-sample` if all runs are from the same system. When more runs are provided than needed, prefer a diverse subset — different systems, mix of pass/fail, different sizes. When validating, confirm each run has vm.log.md, root.prose.md, and at least one binding.

2. **runner** — `call std/evals/inspector` on each sampled run at both depths. This step invokes the inspector — it does not re-implement inspection logic, judge run quality, or perform inspection directly. For each run, invoke `std/evals/inspector` with `depth: light`, then invoke again with `depth: deep`; collect a pair of inspection results per run, each pair carrying run_id, light_inspection (full inspector output), and deep_inspection (full inspector output). Do not inspect a run and its inspection simultaneously — sequential per run, parallel across runs if possible. If the inspector fails on a run, record the failure (which run and why), continue to the next run, and report partial results.

3. **comparator** — Compare light and deep inspection results for each run, identifying agreements, disagreements, and patterns. For each run, produce a structured comparison containing run_id, verdict_match (light verdict == deep verdict), runtime_fidelity_delta (deep score minus light score; positive means light underestimated), task_effectiveness_delta, flag_overlap (flags found by both, only by light, only by deep), disagreement_type (null if agree, or one of "false_positive" — light flagged, deep did not; "false_negative" — light missed, deep caught; "severity_mismatch" — same flag, different severity; "verdict_split" — different verdict category), and notes explaining significant differences. When scores differ by less than 10 points but verdicts match, classify as agreement with minor calibration noise. When verdicts differ, always classify as disagreement regardless of score proximity. When light finds flags that deep does not, treat as a false positive — note it but recognize it may indicate light is being overly cautious (not necessarily bad).

4. **statistician** — Compute aggregate statistics from the comparisons. All calculations must be performed via code execution — never by LLM arithmetic, mental estimation, or uncomputed correlations. Produce computed metrics: agreement_rate (percentage of verdict matches with 95% confidence interval), score_correlation (Pearson r for runtime_fidelity scores and task_effectiveness scores between light and deep), mean_score_delta (average deep - light for each score type), bias_direction ("optimistic" if mean delta < -5, "pessimistic" if > 5, "neutral" otherwise), disagreement_breakdown (count by disagreement_type), and confidence_level ("high", "medium", or "low" per the Returns thresholds). When computing correlation with fewer than 5 points, report "insufficient data for correlation" instead of a misleading r value. When computing confidence intervals, use the Wilson score interval for proportions, not the normal approximation. Always show the work: include the raw numbers alongside computed statistics. Raise `computation-failed` if code execution fails (include the error).

5. **advisor** — Analyze disagreement patterns and recommend improvements to the light evaluation criteria, drawing on both the comparisons and the statistics. Produce a prioritized list of recommendations, each with priority (1 highest through N), target (which aspect of light eval to change), rationale (what disagreement pattern motivates it), proposed_change (specific description of what to adjust), and expected_impact (how much this would improve agreement rate). When agreement is high (> 90%), focus recommendations on edge cases and maintaining reliability. When agreement is low (< 75%), focus on the most common disagreement type first. When light is consistently optimistic, recommend adding specific structural checks that catch the issues deep finds. When light is consistently pessimistic, recommend relaxing specific criteria that trigger false positives.

The final report assembles the sampler's sample_size, the statistician's statistics (agreement_rate, score_correlation, bias_direction, confidence), the comparator's disagreements, and the advisor's recommendations into the `report` value described in `### Returns`.
