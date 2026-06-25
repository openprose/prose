---
name: inspector
kind: function
version: 0.15.0
---

# Post-Run Inspector

Analyze a completed OpenProse run for runtime fidelity (did the OpenProse VM execute the system correctly?) and task effectiveness (did the system accomplish its goal?). This is the foundational eval — every other eval in the standard library depends on inspector output.

### Parameters

- subject: run — the completed run to inspect
- depth: inspection depth — "light" (fast, checks structure and outputs exist) or "deep" (thorough, reads all artifacts, traces execution against system spec)

### Returns

- inspection: structured inspection report containing:
    - run_id: the inspected run's identifier
    - system: the system that was run
    - depth: which depth was performed
    - runtime_fidelity: score (0-100) measuring how faithfully OpenProse VM executed the system
    - task_effectiveness: score (0-100) measuring how well the system accomplished its stated goal
    - services: per-service breakdown with status, timing, contract satisfaction
    - flags: list of specific issues found, each with severity (info / warning / critical) and evidence
    - verdict: overall assessment — "pass", "partial", or "fail"
    - summary: 2-3 sentence human-readable summary

### Errors

- missing-artifacts: the run directory is missing critical files (vm.log.md, root.prose.md, or forme.manifest.json)
- corrupted-log: vm.log.md exists but cannot be parsed (no event markers, no header)

### Invariants

- inspection output is deterministic for a given run and depth — the same run inspected twice at the same depth produces the same scores and verdict

### Strategies

- when depth is light: check structural completeness only — vm.log.md has `---end` or `---error`, all declared services have bindings, output files are non-empty, no `__error.md` files. Do not read output content in detail. Target: under 30 seconds, under 10K tokens.
- when depth is deep: read root.prose.md to understand intent, read forme.manifest.json to understand expected wiring, trace vm.log.md event markers against the manifest's execution order, read each sub-unit's workspace artifacts and bindings, evaluate output quality against the system's `### Maintains` / `### Returns` clauses. Target: thorough analysis, no shortcuts.
- when a sub-unit has `__error.md`: read it, classify the error, check whether the system's conditional returns / maintained postconditions handled the degradation correctly
- when scoring runtime fidelity: weight heavily on execution order correctness (did services run in the right order?), binding integrity (did outputs get copied correctly?), and vm.log.md completeness (are all markers present?)
- when scoring task effectiveness: weight heavily on whether the system's top-level maintained truth is satisfied by the final output in bindings

### Execution

```prose
let index_result = call index
  subject: subject

let extraction = call extractor
  subject: subject
  depth: depth
  prior-inspections: index_result.prior-inspections

let evaluation = call evaluator
  extraction: extraction.extraction
  depth: depth

let result = call synthesizer
  extraction: extraction.extraction
  evaluation: evaluation.evaluation
  prior-inspections: index_result.prior-inspections

return { inspection: result.inspection }
```

---

## index

The index is a persistent agent that maintains a registry of all inspections performed. It enables deduplication (skip re-inspecting the same run at the same depth) and cross-inspection queries.

### Runtime

- `persist`: user


### Requires

- subject: the run binding from the caller

### Maintains

A standing registry of all inspections performed, persisted across runs. For the requested subject:

- prior-inspections: JSON list of any prior inspections of this run, with their depth and verdict. Empty list if none found.

### Strategies

- maintain a compact registry: run_id, system, depth, verdict, timestamp
- when queried about a run: return all matching entries
- keep the registry under 500 entries by evicting oldest entries

---

## extractor

Read the run's artifacts and produce a structured extraction suitable for evaluation. The extractor does not judge — it reads and organizes.

### Parameters

- subject: the run binding
- depth: "light" or "deep"
- prior-inspections: from index

### Returns

- extraction: structured data containing:
    - run_id: string
    - system_name: string
    - completed: boolean (vm.log.md has `---end`)
    - failed: boolean (vm.log.md has `---error`)
    - error_count: number of `✗` markers in vm.log.md
    - services_declared: list of service names from manifest
    - services_completed: list of service names with `✓` markers
    - services_errored: list of service names with `✗` markers
    - bindings_present: list of binding paths that exist and are non-empty
    - bindings_missing: list of expected bindings that are absent or empty
    - (deep only) root_source: full content of root.prose.md
    - (deep only) manifest_summary: execution order and wiring from forme.manifest.json
    - (deep only) service_outputs: map of service name to first 500 chars of each binding
    - (deep only) workspace_artifacts: map of service name to list of files in workspace
    - (deep only) error_details: contents of any `__error.md` files

### Errors

- unreadable-run: cannot read required files from the run directory

### Strategies

- when depth is light and a prior deep inspection exists: note "prior deep available" in extraction but do not skip light extraction (light is cheap, always re-run)
- when reading large files: truncate to relevant portions, never attempt to load entire multi-MB outputs
- when vm.log.md uses `->` instead of `→`: accept both forms per spec

---

## evaluator

Apply judgment to the extraction. Score runtime fidelity and task effectiveness independently. The evaluator is the most critical service — it must be precise, evidence-based, and calibrated.

### Parameters

- extraction: structured extraction from extractor
- depth: "light" or "deep"

### Returns

- evaluation: structured judgment containing:
    - runtime_fidelity: object with score (0-100), breakdown (execution_order, binding_integrity, vm_log_completeness, error_handling — each 0-100), and evidence (list of specific observations)
    - task_effectiveness: object with score (0-100), breakdown (output_existence, output_substance, contract_satisfaction, goal_alignment — each 0-100), and evidence (list of specific observations)
    - flags: list of issues, each with id, severity (info / warning / critical), description, and evidence
    - verdict: "pass" (both scores >= 70, no critical flags), "partial" (one score < 70 or critical flags present but run completed), or "fail" (either score < 40 or run did not complete)

### Errors

- insufficient-data: extraction is too sparse to evaluate (e.g., light extraction of a failed run with no bindings)

### Strategies

- when depth is light: evaluate only structural metrics — completion, binding existence, error absence. Score conservatively (cap at 85 for runtime fidelity, 80 for task effectiveness) since light cannot verify content quality.
- when depth is deep: evaluate everything — trace execution against manifest, read outputs against the subject's maintained truth / returns, check for shape violations, assess output quality
- when scoring: use the full 0-100 range. A perfect run scores 95-100, not 100 (reserve 100 for extraordinary cases). A run with minor issues scores 70-85. A run with significant problems scores 40-69. A fundamentally broken run scores below 40.
- when a run failed but produced partial output: evaluate what exists. A failed run can still have high task effectiveness if the partial output is useful.
- when evidence conflicts: note the conflict explicitly in flags rather than silently resolving it

---

## synthesizer

Combine evaluation results into the final inspection report. Format for both machine consumption (structured JSON) and human readability (summary text).

### Parameters

- extraction: from extractor
- evaluation: from evaluator
- prior-inspections: from index

### Returns

- inspection: the final inspection report matching the function's top-level returns schema exactly

### Strategies

- when prior inspections exist: note trends (e.g., "this run scored higher/lower than previous inspections of the same system")
- when formatting: the inspection must be valid JSON with a `summary` field containing markdown prose — machine-parseable with a human-readable summary embedded
- when the verdict is "fail": the summary must lead with the most critical issue and its evidence, not with boilerplate
