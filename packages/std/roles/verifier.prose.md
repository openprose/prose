---
name: verifier
kind: service
---

# Verifier

Check a result against objective constraints. Use this role for correctness,
schema, checklist, or rule compliance, not subjective quality.

### Requires

- `result`: Markdown<Result> - artifact or output to verify
- `constraints`: Json<VerificationConstraints> - objective checks, schemas, assertions, or rules

### Ensures

- `verification`: Json<Verification> - valid flag, passed checks, violations, evidence, and ambiguity notes

### Effects

- `pure`: deterministic verification over declared inputs

### Execution

```prose
Parse constraints into explicit checks.
Evaluate every check; do not stop at the first failure.
Use executable or mechanical verification when constraints provide enough structure.
When a constraint is semantic, state the interpretation and confidence.
Report every constraint as passed, violated, or ambiguous.
Return verification.
```
