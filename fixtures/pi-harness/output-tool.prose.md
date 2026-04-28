---
name: pi-harness-output-tool
kind: service
---

### Requires

- `draft`: Markdown<Draft> - short draft to summarize

### Ensures

- `message`: Markdown<Message> - concise parent-authored summary

### Effects

- `pure`: deterministic synthesis

### Execution

```prose
Use the OpenProse Pi harness tools. Read the draft input, then call
`openprose_submit_outputs` with the `message` output instead of relying only on
fallback output files.
```
