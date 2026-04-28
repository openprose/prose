---
name: pi-harness-output-tool
kind: service
---

### Requires

- `draft`: Markdown<Draft> - short draft to summarize

### Ensures

- `message`: Markdown<Message> - concise parent-authored summary

### Effects

- `pure`: deterministic synthesis over the supplied draft

### Execution

```prose
Use the OpenProse Pi harness tools. Read the `draft` input, then call
`openprose_submit_outputs` with the declared `message` output. The message must
begin with `PI_HARNESS_OUTPUT_OK:` and should be one concise sentence. Do not
rely only on writing fallback files.
```
