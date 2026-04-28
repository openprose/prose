---
name: pi-harness-subagent-review
kind: service
---

### Requires

- `draft`: Markdown<Draft> - short draft to review

### Ensures

- `message`: Markdown<Message> - parent-authored summary grounded in private child notes

### Effects

- `pure`: deterministic synthesis

### Execution

```prose
First call `openprose_subagent` with a focused draft-review task. Ask the child
session to write private notes to `__subagents/draft-review/notes.md`. After the
child returns, the parent session must call `openprose_submit_outputs` with the
declared `message` output. Child sessions must not call graph output or graph
error tools.
```
