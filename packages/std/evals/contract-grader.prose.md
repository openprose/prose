---
name: contract-grader
kind: program
---

# Contract Grader

The most fundamental eval: did the program do what it promised? Given a completed run, evaluate whether each service's `ensures` clause was actually satisfied by its output. This operates at per-service granularity — a program can have some services that satisfied their contracts and others that did not.

Contract grading is distinct from inspection. The inspector evaluates runtime fidelity (did Press run correctly?) and task effectiveness (did the output achieve the goal?). The contract grader evaluates contract satisfaction (did each service produce what it declared it would produce?). A program can pass inspection but fail contract grading if its contracts are vague and the inspector cannot distinguish "met" from "not met."

### Services

- extractor
- grader
- scorer

### Requires

- `subject`: string - run — the completed run to grade

### Ensures

- `grade`: Markdown<Grade> - structured contract satisfaction report containing:
    - run_id: string
    - program: string
    - overall_score: 0-100 percentage of contract clauses satisfied
    - overall_verdict: "satisfied" (all services pass), "partial" (some services pass), or "violated" (majority of services fail)
    - services: list of per-service grades, each containing:
        - name: service name
        - ensures_clauses: list of the service's declared ensures clauses
        - each clause has: text (the declared clause), verdict ("satisfied", "partially_satisfied", "violated", "not_evaluable"), evidence (specific output content that supports the verdict), confidence (0-100 how certain the grader is)
        - service_score: 0-100 percentage of clauses satisfied for this service
    - conditional_ensures: list of conditional ensures clauses (if X: Y) with whether the condition was triggered and whether the degraded output was provided
    - unevaluable_clauses: list of ensures clauses that are too vague to grade, with explanation of why
    - recommendations: suggestions for making unevaluable clauses more specific


### Effects

- `pure`: deterministic transformation over declared inputs

### Errors

- missing-program: the run directory does not contain program.md
- missing-manifest: the run directory does not contain manifest.md (cannot determine expected services)
- no-outputs: the run has no bindings at all (nothing to grade)

### Invariants

- every ensures clause in every service is accounted for — either graded or listed as unevaluable
- the overall_score is the arithmetic mean of service_scores, weighted by number of clauses per service

### Strategies

- when grading a clause: read the declared ensures text, then read the actual output in the service's bindings. Determine if the output satisfies the commitment. Be strict — "a summary" is satisfied by any summary, but "a 2-3 paragraph summary preserving key claims" requires paragraphs, requires 2-3 of them, and requires that key claims from the input are present.
- when a clause mentions a specific format (JSON, markdown, list): check that the output is in that format
- when a clause mentions a specific count ("3+ sources", "at least 5"): count the actual items
- when a clause mentions a quality criterion ("critically evaluated", "well-sourced"): apply informed judgment but note the subjectivity in the confidence score (lower confidence for subjective criteria)
- when a clause is too vague to evaluate meaningfully: mark as "not_evaluable" and explain why. "A good report" is not evaluable. "A report containing X, Y, and Z" is.
- when conditional ensures exist: first determine if the condition was triggered (did the error occur?), then grade the conditional output if so
- when a service errored: check if the program declared that error and provided a conditional ensures, then grade the degraded path

---

## extractor

Read the run's artifacts and extract all contract information: what each service promised and what each service produced.

### Requires

- `subject`: string - the run binding

### Ensures

- `contracts`: JSON<Contracts> - for each service in the run, a structured record containing:
    - name: service name
    - ensures_clauses: list of ensures clauses from the service's source file in `services/`
    - conditional_ensures: list of conditional ensures clauses
    - actual_output: content of the service's bindings (truncated to 2000 chars per binding if longer)
    - had_error: boolean (whether `__error.md` exists in workspace)
    - error_name: the error name if errored, null otherwise
- `program_ensures`: Markdown<ProgramEnsures> - the top-level program's ensures clauses
- `program_output`: Markdown<ProgramOutput> - the final output binding content


### Effects

- `pure`: deterministic evaluation over declared inputs

### Errors

- missing-program: program.md not found
- missing-manifest: manifest.md not found

### Strategies

- read services from `services/*.md` in the run directory — these are the snapshots from when the program ran
- read ensures clauses by parsing the contract section of each service file
- read actual output from `bindings/{service}/` directories
- for large outputs: include enough content to evaluate each clause, but truncate responsibly

---

## grader

Evaluate each ensures clause against the actual output. This is the core judgment service — it must be precise, evidence-based, and honest about uncertainty.

### Requires

- `contracts`: JSON<Contracts> - extracted contract information from extractor

### Ensures

- `grades`: JSON<Grades> - for each service, for each ensures clause: verdict, evidence, and confidence
- each grade has: service_name, clause_text, verdict ("satisfied" / "partially_satisfied" / "violated" / "not_evaluable"), evidence (quoted output content or absence thereof), confidence (0-100)


### Effects

- `pure`: deterministic evaluation over declared inputs

### Strategies

- grade each clause independently — do not let the verdict on one clause influence another
- when quoting evidence: use exact text from the output, not paraphrases
- when a clause has multiple sub-requirements (e.g., "summary with key claims AND confidence scores"): all sub-requirements must be met for "satisfied", some met for "partially_satisfied"
- when confidence is below 50: mark as "not_evaluable" rather than guessing — it is better to flag an ambiguous clause than to give a false verdict
- when a service errored and has a conditional ensures: grade the conditional path, not the primary ensures
- assign confidence based on clause specificity: specific, measurable clauses get high confidence (80-100), subjective quality clauses get medium confidence (50-80), vague clauses get low confidence (below 50)

---

## scorer

Aggregate per-clause grades into per-service and overall scores. Format the final report.

### Requires

- `grades`: JSON<Grades> - per-clause verdicts from grader
- `contracts`: JSON<Contracts> - from extractor (for context and recommendations)

### Ensures

- `grade`: Markdown<Grade> - the final output matching the program's top-level ensures schema exactly


### Effects

- `pure`: deterministic evaluation over declared inputs

### Strategies

- compute service_score as: (satisfied_clauses + 0.5 * partially_satisfied_clauses) / total_evaluable_clauses * 100
- compute overall_score as weighted mean of service_scores, weighted by clause count
- for recommendations on unevaluable clauses: suggest specific rewrites that would make the clause testable (e.g., "change 'a good summary' to 'a 2-3 paragraph summary that includes all named entities from the input'")
- when all clauses are satisfied: still check for conditional ensures that were not tested — note them as untested paths
