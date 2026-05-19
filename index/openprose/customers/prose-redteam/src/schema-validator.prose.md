---
name: schema-validator
kind: service
---

# Schema Validator

### Description

Critic slot for the `reviewed-report` worker-critic pair. Fails closed on any
report that is not schema-conformant — especially any finding that ships
without reproduction evidence or an explicit reasoned no-repro note.

### Requires

- `output`: the reporter's candidate report
- `task_brief`: the original brief the report must satisfy
- `criteria`: the report schema and acceptance rules

### Ensures

- `verdict`: `{ verdict: "accept" | "reject", reasoning, issues, suggestions }`
  — `accept` only when every finding carries a root cause, a compiled+executed
  PoC or a reasoned no-repro note, an independent re-reproduction verdict, a
  reachability verdict, a severity, and a dedupe group id, and coverage lists
  explored vs. deferred (including refusals) with reasons

### Shape

- `self`: check the report against the schema and acceptance rules
- `prohibited`: editing the report; accepting a finding that lacks reproduction
  evidence or a reasoned no-repro note; accepting on partial conformance

### Strategies

- fail closed: any missing required field on any finding is a `reject` with the
  specific finding and field named in `issues`
- a finding presented as reproduced whose evidence is only a no-repro note is a
  `reject` — this is the firewall's last line
- `suggestions` should be concrete enough that the reporter can fix the report
  without re-deriving the schema
