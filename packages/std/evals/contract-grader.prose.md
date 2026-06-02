---
name: contract-grader
kind: function
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
    - overall_score: 0-100 percentage of contract clauses satisfied
    - overall_verdict: "satisfied" (all contracts pass), "partial" (some contracts pass), or "violated" (majority of contracts fail)
    - contracts: list of per-contract grades, each containing:
        - name: contract name
        - clauses: list of the contract's declared return/maintain clauses
        - each clause has: text (the declared clause), verdict ("satisfied", "partially_satisfied", "violated", "not_evaluable"), evidence (specific output content that supports the verdict), confidence (0-100 how certain the grader is)
        - contract_score: 0-100 percentage of clauses satisfied for this contract
    - conditional_clauses: list of conditional clauses (if X: Y) with whether the condition was triggered and whether the degraded output was provided
    - unevaluable_clauses: list of clauses that are too vague to grade, with explanation of why
    - recommendations: suggestions for making unevaluable clauses more specific

The returned `grade` is guaranteed to account for every declared clause in every contract — each is either graded or listed as unevaluable — and `overall_score` is the arithmetic mean of contract_scores, weighted by number of clauses per contract.

### Errors

- missing-root: the run directory does not contain root.prose.md
- missing-manifest: the run directory does not contain forme.manifest.json (cannot determine expected contracts)
- no-outputs: the run has no bindings at all (nothing to grade)

### Invariants

- every declared clause in every contract is accounted for — either graded or listed as unevaluable
- the overall_score is the arithmetic mean of contract_scores, weighted by number of clauses per contract

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
- actual_output: content of the contract's bindings (truncated to 2000 chars per binding if longer)
- had_error: boolean (whether `__error.md` exists in workspace)
- error_name: the error name if errored, null otherwise

Also produces `system_clauses` (the top-level contract's declared clauses) and `system_output` (the final output binding content).

Strategies:
- read contracts from `sources/*.prose.md` in the run directory — these are the snapshots from when the system ran
- read declared clauses by parsing the contract section of each file
- read actual output from `bindings/{contract}/` directories
- for large outputs: include enough content to evaluate each clause, but truncate responsibly
- raise missing-root if root.prose.md not found; raise missing-manifest if forme.manifest.json not found

#### grade

Evaluate each declared clause against the actual output. This is the core judgment phase — it must be precise, evidence-based, and honest about uncertainty.

Produces, for each contract, for each declared clause: verdict, evidence, and confidence. Each grade has: contract_name, clause_text, verdict ("satisfied" / "partially_satisfied" / "violated" / "not_evaluable"), evidence (quoted output content or absence thereof), confidence (0-100).

Strategies:
- grade each clause independently — do not let the verdict on one clause influence another
- when grading a clause: read the declared clause text, then read the actual output in the contract's bindings. Determine if the output satisfies the commitment. Be strict — "a summary" is satisfied by any summary, but "a 2-3 paragraph summary preserving key claims" requires paragraphs, requires 2-3 of them, and requires that key claims from the input are present.
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
- compute overall_score as weighted mean of contract_scores, weighted by clause count
- for recommendations on unevaluable clauses: suggest specific rewrites that would make the clause testable (e.g., "change 'a good summary' to 'a 2-3 paragraph summary that includes all named entities from the input'")
- when all clauses are satisfied: still check for conditional clauses that were not tested — note them as untested paths
