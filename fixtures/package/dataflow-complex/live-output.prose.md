---
name: dataflow-live-output
kind: service
---

### Requires

- `topic`: string - topic to summarize

### Ensures

- `message`: Markdown<Message> - sentinel-bearing live output

### Effects

- `pure`: deterministic synthesis over the supplied topic

### Execution

```prose
Use `openprose_submit_outputs` exactly once. The `message` output must include
`DATAFLOW_LIVE_OUTPUT_OK` and mention the supplied topic.
```
