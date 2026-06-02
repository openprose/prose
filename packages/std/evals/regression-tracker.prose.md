---
name: regression-tracker
kind: responsibility
---

# Regression Tracker

Maintain a registry of "known good" baseline runs for each system. When a new run completes, compare it against the baseline and flag regressions. This is the continuous quality gate — it answers "did this change make things worse?" without requiring a human to review every run.

The registry is persistent at the project level, so baselines survive across runs and can be updated when a new run is confirmed as the new standard.

### Goal

Maintain a standing registry of baseline runs per system and, on each new run, judge whether quality regressed, held, or improved against that baseline.

### Continuity

Input-driven: woken by a new run to check, or by a request to set a baseline or list baselines.

### Requires

- subject: run — the new run to compare against baseline
- system-name: the system name to look up the baseline for (e.g., "deep-research", "anomaly-detective")
- action: "check" (compare against baseline), "set-baseline" (register this run as the new baseline), or "list" (show all registered baselines)

### Maintains

The standing baseline registry — a persistent, project-level map of system name → baseline run, surviving across runs and updatable when a new run is confirmed as the new standard. Each system's entry carries its baseline_run_id, baseline_scores (contract_satisfaction, runtime_fidelity, task_effectiveness), and the timestamp it was registered; the last 5 previous baselines per system are kept for trend analysis. The registry is material truth; volatile request ids and read-time access timestamps are immaterial.

Alongside the registry, each handled request yields a report:

- system: the system name
- action: which action was performed
- (for check) status: "pass" (no regressions), "regressed" (worse than baseline), or "improved" (better than baseline)
- (for check) baseline_run_id: which baseline was compared against
- (for check) new_run_id: the new run's ID
- (for check) dimensions: per-dimension comparison (contract_satisfaction, output_quality, timing, error_rate) each with baseline value, new value, delta, and verdict
- (for check) evidence: specific differences that support the overall status
- (for check) recommendation: "promote to baseline" (if improved), "investigate regression" (if regressed), or "no action needed" (if pass)
- (for set-baseline) confirmation: which run was registered as baseline for which system
- (for list) baselines: list of all registered baselines with system name, run_id, timestamp, and scores

Postconditions:

- if no baseline exists for this system: the report notes "no baseline — registering this run as initial baseline" and the registry is updated to register this run as the initial baseline (a "check" with no baseline auto-sets it).
- a "check" status of "regressed" must cite the specific dimension that regressed with supporting evidence — e.g. "task_effectiveness dropped from 85 to 62 because the synthesizer's output is missing the sources section".
- the report always includes the recommendation field — this is the actionable output that CI pipelines will read.
- regression thresholds applied consistently: contract_satisfaction drop > 10 points, output quality materially worse (judgment call), timing > 50% slower, any new errors.

### Errors

- run-not-found: the subject run does not exist or is incomplete
- baseline-corrupted: the registered baseline run no longer exists on disk

### Invariants

- when the baseline run no longer exists on disk: flag as corrupted and recommend setting a new baseline.
- when the registry grows beyond 100 systems: warn but do not evict — regression tracking should not lose data silently.
- comparison strategy: use contract-grader scores if available, otherwise use inspector scores, otherwise fall back to structural comparison (output existence and size).
- when an improvement is detected: still compare carefully — an improvement in one dimension might mask a regression in another.

### Execution

The render maintains the registry and produces the report by composing three internal steps. Order matters, so they run as ProseScript `call`s, not as separate mounted nodes.

```prose
const registryState = call registry(subject, system-name, action)

let comparison = null
if action == "check" and registryState.has_baseline:
  comparison = call comparator(subject, registryState)

const report = call reporter(registryState, comparison, action, subject, system-name)
return report
```

---

## registry

Maintains the baseline registry. Maps system names to baseline run IDs and their scores. This is the persistent, standing truth that survives across runs.

### Runtime

- `persist`: project

### Parameters

- subject: the run binding
- system-name: the system name
- action: "check", "set-baseline", or "list"

### Returns

- registry-state: current state of the registry for this system, containing:
    - has_baseline: boolean
    - baseline_run_id: string or null
    - baseline_scores: object with contract_satisfaction, runtime_fidelity, task_effectiveness scores (or null if no baseline)
    - baseline_timestamp: when the baseline was registered
    - all_baselines: (for "list" action) complete registry contents

  The returned registry-state reflects the registry after this action: when action is "set-baseline" the registry entry for this system is updated and the returned state reflects the new baseline; when action is "check" the current baseline is returned without modifying the registry; when action is "list" all entries are returned. The registry stays compact (system_name, baseline_run_id, baseline_scores, timestamp) and keeps a history of previous baselines (last 5 per system) for trend analysis.

---

## comparator

Compare the new run against the baseline across all quality dimensions. This reads artifacts from both runs.

### Parameters

- subject: the new run binding
- registry-state: from registry (contains baseline run ID and scores)

### Returns

- comparison: structured comparison containing:
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

  If no baseline: comparison is null (the registry handles auto-registration).

### Errors

- baseline-corrupted: baseline run directory does not exist or is missing critical files

### Invariants

- for contract_satisfaction: compare ensures clause satisfaction rates. Run contract-grader logic on both if needed, or use cached scores from registry.
- for output_quality: compare final output content — is the new run's output as comprehensive, accurate, and well-structured as the baseline's?
- for timing: compare durations from vm.log.md. A slowdown of more than 50% is a regression. A speedup is an improvement.
- for error_rate: compare error markers in vm.log.md. Any new errors that the baseline did not have are regressions.
- regression thresholds: contract_satisfaction drop > 10 points, output quality materially worse (judgment call), timing > 50% slower, any new errors.
- when baseline has cached scores: use them rather than re-reading all baseline artifacts (the registry stores scores for this reason).

---

## reporter

Synthesize the comparison into the final regression report. Handle all three actions (check, set-baseline, list).

### Parameters

- registry-state: from registry
- comparison: from comparator (may be null for set-baseline and list actions)
- action: the requested action
- subject: the run binding
- system-name: the system name

### Returns

- report: the final output matching the top-level Maintains report schema.

### Invariants

- for "check" with regression: lead with the most severe regression, include evidence, recommend investigation before promoting.
- for "check" with improvement: lead with the improvement, recommend promoting to baseline, but note any dimensions that stayed the same or slightly degraded.
- for "check" with pass: brief confirmation that the new run matches baseline quality.
- for "set-baseline": confirm registration with the run ID and scores that were recorded.
- for "list": format as a table with system name, baseline run ID, timestamp, and key scores.
- always include the recommendation field — this is the actionable output that CI pipelines will read.
</content>
</invoke>
