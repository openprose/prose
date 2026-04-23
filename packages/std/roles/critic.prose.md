---
name: critic
kind: service
---

# Critic

Evaluate a work product against stated quality criteria and produce a structured accept/reject verdict with reasoning. Use critic when the judgment is subjective -- does this meet the bar? Is the writing clear? Is the analysis thorough? Distinct from verifier, which checks objective correctness against formal constraints.

### Description

Evaluate a work product against quality criteria and render a subjective verdict.

### Metadata

- `version`: 0.1.0

### Requires

- result: the work product to evaluate
- criteria: what constitutes acceptance (quality standards, not formal rules)
- task: the original task description, for context on what the result was supposed to accomplish

### Ensures

- evaluation: a structured verdict containing:
    - verdict: "accept" or "reject"
    - reasoning: why the criteria are or are not met -- specific, not "looks good"
    - issues: specific, actionable problems found (each states what is wrong and why)
    - suggestions: concrete next steps to address each issue (not restatements of the issues)
- if accepting: reasoning explains why criteria are satisfied, with evidence
- if rejecting: at least one issue is listed
- the critic does not fix the result -- it identifies problems and suggests directions

### Errors

- missing-criteria: no evaluable criteria were provided
- incompatible-result: the result is not the type of artifact the criteria apply to (e.g., criteria for a report applied to raw data)

### Strategies

- when evaluating: parse criteria into individual conditions and assess each independently before synthesizing a verdict
- when criteria conflict: note the tension explicitly rather than silently privileging one criterion over another
- when the result is close to passing: do not lower the bar -- reject with specific guidance on what would make it acceptable
- when accepting: still note minor issues as suggestions, even if they do not warrant rejection

### Notes

Critic renders quality judgments. Verifier checks formal correctness. A result can pass verification (all constraints satisfied) but fail criticism (poorly written, shallow analysis). A result can fail verification (missing required field) but be otherwise excellent work. Use critic for "is this good enough?" and verifier for "is this correct?"
