---
name: contract-grader
kind: function
version: 0.15.0
---

# Contract Grader

The most fundamental eval: did the system do what it promised? Given a completed run, evaluate whether each contract's commitments were actually satisfied by its output. This operates at per-contract granularity — a run can have some contracts that satisfied their commitments and others that did not.

Contract grading is distinct from inspection. The inspector evaluates runtime fidelity (did the OpenProse VM run correctly?) and task effectiveness (did the output achieve the goal?). The contract grader evaluates contract satisfaction (did each contract produce what it declared it would produce?). A run can pass inspection but fail contract grading if its contracts are vague and the inspector cannot distinguish "met" from "not met."

### Goal

Grade whether each contract in a completed run satisfied the commitments it declared, returning a structured per-contract satisfaction report.

### Parameters

- subject: run — the completed run to grade

### Returns

- grade: structured contract satisfaction report containing:
    - run_id: string
    - system: string
    - execution_kind: "mounted-responsibility" or "standalone-function"
    - overall_score: 0-100 percentage of evaluable contract clauses satisfied, or null when no clauses have trustworthy evidence
    - overall_verdict: "satisfied" (all evaluable contracts pass), "partial" (some evaluable contracts pass), "violated" (the majority of evaluable contracts fail), or "unevaluable" (no clauses have trustworthy evidence)
    - contracts: list of per-contract grades, each containing:
        - name: contract name
        - clauses: list of the contract's declared return/maintain clauses
        - each clause has: text (the declared clause), verdict ("satisfied", "partially_satisfied", "violated", "not_evaluable"), evidence (specific output content that supports the verdict), confidence (0-100 how certain the grader is)
        - contract_score: 0-100 percentage of evaluable clauses satisfied for this contract, or null when none have trustworthy evidence
    - conditional_clauses: list of conditional clauses (if X: Y) with whether the condition was triggered and whether the degraded output was provided
    - unevaluable_clauses: list of clauses that cannot be graded because they are too vague or lack trustworthy evidence, with explanation of why
    - evidence_gaps: list of missing or inconsistent artifacts that prevented a clause from receiving a satisfaction verdict
    - recommendations: suggestions for making unevaluable clauses more specific

The returned `grade` is guaranteed to account for every declared clause in every contract. Each clause is either graded or listed as unevaluable. `overall_score` is the arithmetic mean of non-null contract_scores, weighted by the number of evaluable clauses per contract.

### Errors

- missing-root: the run directory does not contain root.prose.md
- missing-artifacts: the run directory is missing a critical artifact for its execution kind
- unsupported-layout: the root source kind or artifact layout is not supported by this grader
- ambiguous-layout: the root source and run artifacts indicate conflicting execution kinds
- no-outputs: the run has no published outputs for its execution kind

### Invariants

- every declared clause in every contract is accounted for — either graded or listed as unevaluable
- the overall_score is the arithmetic mean of non-null contract_scores, weighted by the number of evaluable clauses per contract

### Execution

Grade the run in three sequential phases, each an internal sub-agent session producing intermediate data for the next. None of these phases is a node; they are intra-node orchestration internal to producing the `grade` return value.

```prose
const contracts = session extract(subject)
const grades = session grade(contracts)
const grade = session score(grades, contracts)
return grade
```

#### extract

Read the run's artifacts and extract all contract information: what each contract promised and what each contract produced.

Produces, for each contract in the run, a structured record containing:
- name: contract name
- clauses: list of declared return/maintain clauses from the contract's source snapshot in `sources/`
- conditional_clauses: list of conditional clauses
- actual_output: content of the contract's resolved published output (truncated to 2000 chars per output if longer)
- output_paths: paths used as grading evidence
- evidence_gaps: missing or inconsistent output, version, or receipt evidence for this contract
- had_error: boolean (whether `__error.md` exists in workspace)
- error_name: the error name if errored, null otherwise

Also produces `system_clauses` (the top-level contract's declared clauses) and `system_output` (the final resolved published output content).

Strategies:
- determine the execution kind before discovering contracts or outputs. A `kind: responsibility` root with a compiled topology is a mounted-responsibility run. A `kind: function` root with a single activation is a standalone-function run. Preserve the evidence used for this decision.
- read contracts from `sources/*.prose.md` in the run directory — these are the snapshots from when the system ran
- read declared clauses by parsing the contract section of each file
- for a mounted responsibility: read node identities and output declarations from `compiled-intent.json`, read each node's `### Maintains` clauses from its source snapshot, and resolve its published output under `world-model/{node}/`
- for a mounted responsibility: verify the receipt chain for each node before treating its world-model as committed evidence. Check `prev` links, distinguish `rendered`, `skipped`, and `failed` receipts, and cross-check the published `.version` with the receipt that committed it. A failed latest receipt may leave prior committed truth in place, which must be labeled as prior truth rather than current successful output.
- for a standalone function: read `### Returns` from the function snapshot and resolve only its declared outputs under `bindings/{function}/`. Do not require `compiled-intent.json`, `world-model/`, or `receipts/`.
- resolve `system_output` from the compiled topology's declared terminal output for a mounted responsibility, or from the standalone function's declared return binding. Do not choose an output directory merely because it contains data.
- if the root kind, control-plane artifacts, and output layout conflict: raise ambiguous-layout. If the kind or layout is not current and supported: raise unsupported-layout. Do not apply retired manifest assumptions silently.
- for large outputs: include enough content to evaluate each clause, but truncate responsibly
- raise missing-root if `root.prose.md` is absent. Raise missing-artifacts when a common or control-plane artifact needed to identify contracts is absent. Once contracts are known, treat missing outputs, receipts, and versions as per-contract evidence gaps so the grader can still return an accountable report.

#### grade

Evaluate each declared clause against the actual output. This is the core judgment phase — it must be precise, evidence-based, and honest about uncertainty.

Produces, for each contract, for each declared clause: verdict, evidence, and confidence. Each grade has: contract_name, clause_text, verdict ("satisfied" / "partially_satisfied" / "violated" / "not_evaluable"), evidence (quoted output content or absence thereof), confidence (0-100).

Strategies:
- grade each clause independently — do not let the verdict on one clause influence another
- before grading a clause: confirm that its expected published output exists and, for a mounted responsibility, has consistent commit evidence. A completion marker in `vm.log.md` is not commit evidence.
- when a declared output is absent: mark the affected clause violated and cite the missing path. When output exists but its mounted receipt or version evidence is missing or inconsistent: mark the clause not_evaluable, record the evidence gap, and never return satisfied or partially_satisfied for that clause.
- when grading a clause: read the declared clause text, then read the contract's resolved actual output. Determine if the output satisfies the commitment. Be strict. "A summary" is satisfied by any summary. "A 2-3 paragraph summary preserving key claims" requires paragraphs, requires 2-3 of them, and requires that key claims from the input are present.
- when a clause mentions a specific format (JSON, markdown, list): check that the output is in that format
- when a clause mentions a specific count ("3+ sources", "at least 5"): count the actual items
- when a clause mentions a quality criterion ("critically evaluated", "well-sourced"): apply informed judgment but note the subjectivity in the confidence score (lower confidence for subjective criteria)
- when quoting evidence: use exact text from the output, not paraphrases
- when a clause has multiple sub-requirements (e.g., "summary with key claims AND confidence scores"): all sub-requirements must be met for "satisfied", some met for "partially_satisfied"
- when a clause is too vague to evaluate meaningfully, or confidence is below 50: mark as "not_evaluable" and explain why — it is better to flag an ambiguous clause than to give a false verdict. "A good report" is not evaluable. "A report containing X, Y, and Z" is.
- when conditional clauses exist: first determine if the condition was triggered (did the error occur?), then grade the conditional output if so
- when a contract errored: check if the run declared that error and provided a conditional clause, then grade the degraded path
- assign confidence based on clause specificity: specific, measurable clauses get high confidence (80-100), subjective quality clauses get medium confidence (50-80), vague clauses get low confidence (below 50)

#### score

Aggregate per-clause grades into per-contract and overall scores, and format the final report matching the `### Returns` schema exactly.

Strategies:
- compute contract_score as: (satisfied_clauses + 0.5 * partially_satisfied_clauses) / total_evaluable_clauses * 100
- compute overall_score as the weighted mean of non-null contract_scores, weighted by evaluable clause count
- exclude not_evaluable clauses from the numeric denominator, but include every related evidence gap in the report. If a contract has no evaluable clauses because its commit evidence is unavailable, set contract_score to null and do not treat it as satisfied when deriving overall_verdict. If no contracts have evaluable clauses, set overall_score to null and overall_verdict to "unevaluable".
- for recommendations on unevaluable clauses: suggest specific rewrites that would make the clause testable (e.g., "change 'a good summary' to 'a 2-3 paragraph summary that includes all named entities from the input'")
- when all clauses are satisfied: still check for conditional clauses that were not tested — note them as untested paths
