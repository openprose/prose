---
name: cross-run-differ
kind: function
---

# Cross-Run Differ

Given 2 or more runs of the same system (different models, inputs, or system versions), produce a structured comparison of outputs, timing, cost, and quality. This enables A/B testing across model tiers, input variations, and system iterations.

### Parameters

- subjects: run[] — completed runs to compare (minimum 2, must be runs of the same system or explicitly related systems)

### Returns

- comparison: structured diff report containing:
    - system: the system name (or names if comparing across versions)
    - runs: list of run metadata (run_id, model, timestamp, duration, status)
    - output_diff: per-service structured comparison of outputs across runs, highlighting semantic differences (not just textual diffs)
    - timing_diff: per-service and total duration comparison with relative speedup/slowdown
    - cost_diff: token usage comparison across runs (if available from vm.log.md or events)
    - quality_diff: if inspector results are available for these runs, compare scores; otherwise note "no inspection data"
    - summary: narrative comparison highlighting the most significant differences and their likely causes
    - recommendation: which run produced the best result and why, or "inconclusive" with reasoning

### Execution

Orchestrate the comparison in three sequential steps, each a `call` to the internal helper below:

1. `call collector` with `subjects` to read all runs and extract comparable data, validating that the runs are meaningfully comparable.
2. `call differ` with the collected `run-data` to produce structured diffs across output, timing, cost, and quality.
3. `call recommender` with the `diffs` and `run-data` to synthesize the final `comparison`.

Return the `comparison` produced by `recommender`.

### Errors

- insufficient-runs: fewer than 2 runs provided
- different-systems: runs are of different systems with no declared relationship (cannot meaningfully compare)
- missing-outputs: one or more runs have no bindings (nothing to compare)

### Invariants

- all runs in the comparison are listed, even if some have missing data — partial comparisons are reported, not silently dropped
- textual diffs are computed deterministically; quality comparisons are judgment calls and are labeled as such

### Strategies

- when comparing outputs: focus on semantic differences, not formatting differences. Two outputs that say the same thing in different words are equivalent. Two outputs that reach different conclusions are substantively different.
- when runs used different models: note the model tier for each run and consider whether differences are model-capability artifacts
- when runs used different inputs: separate input-driven differences from system-behavior differences
- when runs are of different versions of the same system: highlight which system changes caused which output changes
- when one run failed and another succeeded: this is the most important finding — lead with it

---

## collector

Read all runs and extract comparable data. Validate that the runs are meaningfully comparable.

### Parameters

- subjects: the run[] argument

### Returns

- run-data: for each run, a structured record containing:
    - run_id: string
    - system_name: from root.prose.md
    - system_hash: content hash of root.prose.md (to detect version differences)
    - model: model used (if specified in system or manifest)
    - status: "complete", "failed", or "partial"
    - duration: total run time from vm.log.md timestamps
    - services: list of service names with per-service completion status and duration
    - outputs: map of service name to binding content (truncated to 2000 chars per binding)
    - token_count: total tokens if available from events or cost.json
- comparability: assessment of whether these runs are meaningfully comparable, with explanation

### Errors

- insufficient-runs: fewer than 2 valid runs
- different-systems: systems have different names and no structural similarity

### Strategies

- when extracting duration: parse the first timestamp from vm.log.md header and the `---end` timestamp, compute the difference
- when systems have the same name but different content: they are version comparisons — flag the differences
- when systems have different names but similar structure: warn but allow comparison if the user explicitly provided them
- when token data is not available: note "token data unavailable" rather than estimating

---

## differ

Produce structured diffs across all dimensions: output content, timing, cost, and quality.

### Parameters

- run-data: collected data from collector

### Returns

- diffs: structured comparison containing:
    - output_diff: per-service comparison with semantic similarity assessment and highlighted divergences
    - timing_diff: per-service duration comparison with relative percentages
    - cost_diff: token comparison with relative percentages (or "unavailable")
    - quality_diff: inspector score comparison if available
    - key_differences: ranked list of the most significant differences across all dimensions

### Strategies

- for output comparison: identify the highest-value output (usually the final service's binding) and compare it in detail first, then compare intermediate services
- for timing comparison: normalize to the fastest run as baseline, report others as percentage slower
- for cost comparison: normalize to the cheapest run as baseline
- when more than 2 runs: present as a table with one column per run, not pairwise comparisons
- when outputs are identical: explicitly note "outputs are identical" — this is an important finding (means the model/input change had no effect)

---

## recommender

Synthesize the diffs into actionable recommendations.

### Parameters

- diffs: structured comparison from differ
- run-data: from collector (for context)

### Returns

- comparison: the final output matching the top-level `### Returns` schema, with recommendation and summary

### Strategies

- when one run is clearly better on all dimensions: recommend it clearly
- when runs trade off (one faster, another higher quality): present the tradeoff and let the user decide, but state which dimension matters more for this type of system
- when differences are negligible: recommend the cheaper/faster run and note that quality is equivalent
- when a run failed: recommend investigating the failure before drawing conclusions from the comparison
- always ground recommendations in evidence from the diffs — never make unsupported claims about run quality
