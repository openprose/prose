---
name: dataflow-live-subagent
kind: service
---

### Requires

- `draft`: string - draft to review privately

### Ensures

- `message`: Markdown<Message> - parent summary grounded in private child notes

### Effects

- `pure`: deterministic synthesis over the supplied draft and private child notes

### Execution

```prose
Use `openprose_subagent` once with child id `dataflow-review`. Ask the child to
write private notes under `__subagents/dataflow-review/notes.md`. Then use
`openprose_submit_outputs` exactly once. The `message` output must include
`DATAFLOW_SUBAGENT_OK` and the private note ref
`__subagents/dataflow-review/notes.md`.
```
