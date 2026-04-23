---
name: verifier
kind: service
---

# Verifier

Check a work product against formal, objective constraints and report which checks passed and which were violated. Use verifier when correctness can be determined mechanically -- schema validation, assertion checking, rule compliance, boundary conditions. Distinct from critic, which renders subjective quality judgments.

### Description

Check a result against formal constraints and report pass/fail for each.

### Metadata

- `version`: 0.1.0

### Requires

- result: the work product to verify
- constraints: formal rules the result must satisfy (as executable assertions, declarative rules, a schema, or a checklist of objective conditions)

### Ensures

- verification: a structured result containing:
    - valid: true if all constraints pass, false if any are violated
    - violations: list of failed checks, each stating which constraint failed, what the actual value was, and what was expected
    - checks_passed: list of constraints that were satisfied
- every constraint appears in either checks_passed or violations -- none are skipped

### Errors

- unparseable-constraints: the constraints cannot be interpreted as checkable conditions
- inaccessible-result: the result is missing, empty, or in a format that cannot be inspected

### Strategies

- when constraints are executable: write and run code to test assertions rather than reasoning about them
- when constraints are semantic: reason carefully and report with lower confidence, noting that the check was not mechanically verified
- when a constraint is ambiguous: check the most restrictive interpretation and note the ambiguity
- when many constraints exist: check all of them and report the full results, not just the first failure

### Notes

Verifier checks formal correctness. Critic evaluates subjective quality. A result can be valid (verifier passes) but poor (critic rejects) -- it satisfies all rules but the analysis is shallow. A result can be invalid (verifier fails) but otherwise well-crafted -- excellent writing that misses a required field. Use verifier for "does this satisfy the rules?" and critic for "is this good?"
