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
    - execution_kind: "mounted-responsibility" or "standalone-function"
    - depth: which depth was performed
    - runtime_fidelity: score (0-100) measuring how faithfully OpenProse VM executed the system
    - task_effectiveness: score (0-100) measuring how well the system accomplished its stated goal
    - units: per-node breakdown for a mounted responsibility, or the function's status, timing, and contract satisfaction for a standalone function
    - flags: list of specific issues found, each with severity (info / warning / critical) and evidence
    - verdict: overall assessment — "pass", "partial", or "fail"
    - summary: 2-3 sentence human-readable summary

### Errors

- missing-artifacts: the run directory is missing a critical common or execution-kind-specific artifact
- corrupted-log: vm.log.md exists but cannot be parsed (no event markers, no header)
- unsupported-layout: the root source kind or artifact layout is not supported by this inspector
- ambiguous-layout: the root source and run artifacts indicate conflicting execution kinds

### Invariants

- inspection output is deterministic for a given run and depth — the same run inspected twice at the same depth produces the same scores and verdict

### Strategies

- before discovering outputs: determine the subject's execution kind from `root.prose.md` and its control-plane artifacts. A `kind: responsibility` root with a compiled topology is a mounted-responsibility run. A `kind: function` root with a single activation is a standalone-function run. If the evidence conflicts, raise ambiguous-layout instead of choosing the layout that appears most complete.
- when depth is light: check structural completeness for the detected execution kind. Require `vm.log.md` and `root.prose.md` for both kinds. For a mounted responsibility, also require `compiled-intent.json`, declared node outputs under `world-model/`, and a valid receipt chain under `receipts/`. For a standalone function, require declared `### Returns` outputs under `bindings/`. Output files must be non-empty and no `__error.md` files may be left unhandled. Do not read output content in detail. Target: under 30 seconds, under 10K tokens.
- when depth is deep: read `root.prose.md` to understand intent. For a mounted responsibility, read `compiled-intent.json`, trace `vm.log.md` against its topology, cross-check published `world-model/` artifacts and `.version` files against the corresponding receipt chains, and evaluate outputs against each node's `### Maintains`. For a standalone function, trace its single activation, read its declared outputs from `bindings/`, and evaluate them against `### Returns`. Read relevant workspace artifacts for either kind. Target: thorough analysis, no shortcuts.
- when a sub-unit has `__error.md`: read it, classify the error, check whether the system's conditional returns / maintained postconditions handled the degradation correctly
- when checking a mounted responsibility: treat the receipt ledger as the source of truth. A completion marker alone does not establish structural fidelity. Report a missing receipt, a broken `prev` chain, a published artifact without a matching successful receipt, or a `.version` inconsistent with its receipt as an evidence gap.
- when checking a standalone function: do not require `world-model/`, `receipts/`, or a mounted topology. Its declared return bindings are the published outputs.
- when the layout is unsupported or combines incompatible current layouts: report unsupported-layout or ambiguous-layout explicitly. Do not fall back to retired manifest assumptions and do not select whichever output directory yields a passing score.
- when scoring runtime fidelity: weight heavily on topology or activation correctness, output integrity for the detected execution kind, receipt integrity for mounted responsibilities, and vm.log.md completeness (are all markers present?)
- when scoring task effectiveness: weight heavily on whether the system's top-level `### Maintains` truth or function's `### Returns` value is satisfied by the resolved published output

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
    - execution_kind: "mounted-responsibility" or "standalone-function"
    - layout_evidence: paths and source declarations used to determine execution_kind
    - completed: boolean (vm.log.md has `---end`)
    - failed: boolean (vm.log.md has `---error`)
    - error_count: number of `✗` markers in vm.log.md
    - units_declared: node names from compiled intent, or the standalone function name
    - units_completed: unit names with successful completion markers
    - units_errored: unit names with `✗` markers
    - outputs_present: published output paths that exist and are non-empty
    - outputs_missing: expected published output paths that are absent or empty
    - receipt_findings: mounted receipt-chain, status, fingerprint, and published-version checks. Empty for a standalone function.
    - (deep only) root_source: full content of root.prose.md
    - (deep only) compiled_intent_summary: mounted topology order and wiring, or the standalone activation summary
    - (deep only) unit_outputs: map of unit name to the first 500 chars of each published output
    - (deep only) workspace_artifacts: map of unit name to list of files in workspace
    - (deep only) error_details: contents of any `__error.md` files

### Errors

- unreadable-run: cannot read required files from the run directory

### Strategies

- when depth is light and a prior deep inspection exists: note "prior deep available" in extraction but do not skip light extraction (light is cheap, always re-run)
- determine execution_kind before enumerating expected outputs. Use `compiled-intent.json` to resolve mounted nodes and their maintained outputs. Use the standalone function's `### Returns` declarations to resolve expected `bindings/` paths.
- for a mounted responsibility: read each node's latest receipt, verify the `prev` chain, distinguish `rendered`, `skipped`, and `failed` states, and cross-check each published artifact's `.version` with the receipt that committed it. A failed receipt may leave prior published truth in place; report that distinction rather than treating the existing artifact as a fresh success.
- for a standalone function: enumerate only declared return bindings. The absence of `world-model/` or `receipts/` is not an error.
- when current-layout evidence is incomplete or contradictory: preserve the evidence in layout_evidence and raise the matching explicit layout error. Do not infer success from `---end` alone.
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
    - runtime_fidelity: object with score (0-100), breakdown (execution_order, output_integrity, receipt_integrity, vm_log_completeness, and error_handling, each 0-100), and evidence (list of specific observations). receipt_integrity is "not applicable" for standalone functions and is not included in their numeric aggregate.
    - task_effectiveness: object with score (0-100), breakdown (output_existence, output_substance, contract_satisfaction, goal_alignment — each 0-100), and evidence (list of specific observations)
    - flags: list of issues, each with id, severity (info / warning / critical), description, and evidence
    - verdict: "pass" (both scores >= 70, no critical flags), "partial" (one score < 70 or critical flags present but run completed), or "fail" (either score < 40 or run did not complete)

### Errors

- insufficient-data: extraction is too sparse to evaluate (e.g., light extraction of a failed run with no published outputs)

### Strategies

- when depth is light: evaluate only structural metrics — completion, published output existence, error absence. Score conservatively (cap at 85 for runtime fidelity, 80 for task effectiveness) since light cannot verify content quality.
- when depth is deep: evaluate everything — trace execution against the detected control-plane record, read outputs against the subject's maintained truth / returns, check for shape violations, assess output quality
- when evaluating a mounted responsibility: use compiled intent, world-model artifacts, and receipt findings together. A valid completion log cannot compensate for missing or inconsistent commit evidence.
- when evaluating a standalone function: use its activation, return bindings, and log. Do not lower its score for lacking mounted-only artifacts.
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
