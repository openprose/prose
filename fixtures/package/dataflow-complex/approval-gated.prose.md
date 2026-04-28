---
name: dataflow-approval-gate
kind: program
---

### Requires

- `approved_brief`: Markdown<FinalBrief> - approved final brief

### Ensures

- `delivery_receipt`: Markdown<DeliveryReceipt> - delivery confirmation

### Effects

- `delivers`: sends the final brief to an external destination, idempotency_key dataflow-approval-gate

### Finally

Record whether delivery was attempted and where evidence was stored.
