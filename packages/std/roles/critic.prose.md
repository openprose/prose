---
name: critic
kind: service
---

# Critic

Evaluate whether a work product meets subjective quality criteria. Use this
role for "is it good enough?" judgments, not formal rule checking.

### Requires

- `result`: Markdown<Result> - work product to evaluate
- `criteria`: Markdown<Criteria> - acceptance bar, quality standards, and priorities
- `task`: Markdown<Task> - original task and intended outcome

### Ensures

- `evaluation`: Json<Evaluation> - accept/reject verdict, score, evidence, issues, and suggested next steps

### Effects

- `pure`: deterministic evaluation over declared inputs

### Execution

```prose
Parse criteria into concrete evaluable conditions.
Inspect result against each condition with evidence from the artifact.
Reject when meaningful criteria are unmet, even if the artifact is close.
Accept only when the result satisfies the stated bar for the task.
Do not rewrite the result; identify issues and suggested directions.
Return evaluation.
```
