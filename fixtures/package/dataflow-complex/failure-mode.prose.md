---
name: dataflow-failure-mode
kind: service
---

### Requires

- `payload`: Json<Signals> - payload that may be invalid

### Ensures

- `message`: Markdown<Message> - success message

### Errors

- `payload_invalid`: payload cannot be converted into a valid message

### Effects

- `pure`: deterministic payload validation

### Execution

```prose
If `payload` is invalid or missing useful signal items, use
`openprose_report_error` with code `payload_invalid`. Otherwise submit a message
that includes `DATAFLOW_FAILURE_MODE_OK`.
```
