---
name: regression-tracker
kind: program
---

# Regression Tracker

Maintain a registry of "known good" baseline runs for each program. When a new run completes, compare it against the baseline and flag regressions. This is the continuous quality gate — it answers "did this change make things worse?" without requiring a human to review every run.

The registry is persistent at the project level, so baselines survive across runs and can be updated when a new run is confirmed as the new standard.

### Services

- registry
- comparator
- reporter

### Requires

- `subject`: string - run — the new run to compare against baseline
- `program-name`: string - the program name to look up the baseline for (e.g., "deep-research", "anomaly-detective")
- `action`: string - "check" (compare against baseline), "set-baseline" (register this run as the new baseline), or "list" (show all registered baselines)

### Ensures

- `report`: Markdown<Report> - regression report containing:
    - program: the program name
    - action: which action was performed
    - (for check) status: "pass" (no regressions), "regressed" (worse than baseline), or "improved" (better than baseline)
    - (for check) baseline_run_id: which baseline was compared against
    - (for check) new_run_id: the new run's ID
    - (for check) dimensions: per-dimension comparison (contract_satisfaction, output_quality, timing, error_rate) each with baseline value, new value, delta, and verdict
    - (for check) evidence: specific differences that support the overall status
    - (for check) recommendation: "promote to baseline" (if improved), "investigate regression" (if regressed), or "no action needed" (if pass)
    - (for set-baseline) confirmation: which run was registered as baseline for which program
    - (for list) baselines: list of all registered baselines with program name, run_id, timestamp, and scores
- if no baseline exists for this program: report notes "no baseline — registering this run as initial baseline" and performs set-baseline automatically


### Effects

- `pure`: deterministic transformation over declared inputs

### Errors

- run-not-found: the subject run does not exist or is incomplete
- baseline-corrupted: the registered baseline run no longer exists on disk

### Strategies

- when comparing against baseline: use contract-grader scores if available, otherwise use inspector scores, otherwise fall back to structural comparison (output existence and size)
- when a regression is detected: identify the specific dimension that regressed and provide evidence — "task_effectiveness dropped from 85 to 62 because the synthesizer's output is missing the sources section"
- when an improvement is detected: still compare carefully — an improvement in one dimension might mask a regression in another
- when the baseline run no longer exists on disk: flag as corrupted and recommend setting a new baseline
- when action is "check" but no baseline exists: automatically set this run as the baseline and report that

---

## registry

Persistent agent that maintains the baseline registry. Maps program names to baseline run IDs and their scores.

### Runtime

- `persist`: project


### Requires

- `subject`: string - the run binding
- `program-name`: string - the program name
- `action`: string - "check", "set-baseline", or "list"

### Ensures

- `registry-state`: JSON<RegistryState> - current state of the registry for this program, containing:
    - has_baseline: boolean
    - baseline_run_id: string or null
    - baseline_scores: object with contract_satisfaction, runtime_fidelity, task_effectiveness scores (or null if no baseline)
    - baseline_timestamp: when the baseline was registered
    - all_baselines: (for "list" action) complete registry contents


### Effects

- `pure`: deterministic evaluation over declared inputs

### Strategies

- maintain a compact registry: program_name, baseline_run_id, baseline_scores, timestamp
- when action is "set-baseline": update the registry entry for this program
- when action is "check": return the current baseline without modifying the registry
- when action is "list": return all entries
- keep a history of previous baselines (last 5 per program) for trend analysis
- when the registry grows beyond 100 programs: warn but do not evict — regression tracking should not lose data silently

---

## comparator

Compare the new run against the baseline across all quality dimensions. This service reads artifacts from both runs.

### Requires

- `subject`: string - the new run binding
- `registry-state`: JSON<RegistryState> - from registry (contains baseline run ID and scores)

### Ensures

- `comparison`: Markdown<Comparison> - structured comparison containing:
    - baseline_run_id: string
    - new_run_id: string
    - dimensions: list of dimension comparisons, each with:
        - name: "contract_satisfaction", "output_quality", "timing", "error_rate"
        - baseline_value: number or descriptor
        - new_value: number or descriptor
        - delta: numeric difference (positive = improvement, negative = regression)
        - verdict: "improved", "stable", "regressed"
        - evidence: specific observations supporting the verdict
    - overall_status: "pass", "regressed", or "improved" (regressed if any dimension regressed and delta exceeds threshold)
- if no baseline: comparison is null (registry will handle auto-registration)


### Effects

- `pure`: deterministic evaluation over declared inputs

### Errors

- baseline-corrupted: baseline run directory does not exist or is missing critical files

### Strategies

- for contract_satisfaction: compare ensures clause satisfaction rates. Run contract-grader logic on both if needed, or use cached scores from registry.
- for output_quality: compare final output content — is the new run's output as comprehensive, accurate, and well-structured as the baseline's?
- for timing: compare durations from state.md. A slowdown of more than 50% is a regression. A speedup is an improvement.
- for error_rate: compare error markers in state.md. Any new errors that the baseline did not have are regressions.
- regression thresholds: contract_satisfaction drop > 10 points, output quality materially worse (judgment call), timing > 50% slower, any new errors
- when baseline has cached scores: use them rather than re-reading all baseline artifacts (the registry stores scores for this reason)

---

## reporter

Synthesize the comparison into the final regression report. Handle all three actions (check, set-baseline, list).

### Requires

- `registry-state`: JSON<RegistryState> - from registry
- `comparison`: Comparison - from comparator (may be null for set-baseline and list actions)
- `action`: string - the requested action
- `subject`: string - the run binding
- `program-name`: string - the program name

### Ensures

- `report`: Markdown<Report> - the final output matching the program's top-level ensures schema


### Effects

- `pure`: deterministic evaluation over declared inputs

### Strategies

- for "check" with regression: lead with the most severe regression, include evidence, recommend investigation before promoting
- for "check" with improvement: lead with the improvement, recommend promoting to baseline, but note any dimensions that stayed the same or slightly degraded
- for "check" with pass: brief confirmation that the new run matches baseline quality
- for "set-baseline": confirm registration with the run ID and scores that were recorded
- for "list": format as a table with program name, baseline run ID, timestamp, and key scores
- always include the recommendation field — this is the actionable output that CI pipelines will read
