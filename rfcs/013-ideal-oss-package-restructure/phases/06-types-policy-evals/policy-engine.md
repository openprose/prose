# Phase 06.4: Local Policy Engine

## Goal

Make local runs policy-aware without pretending the OSS runtime can enforce
hosted tenant policy. The local runtime should model the same facts the hosted
runtime will enforce: labels, label inheritance, declassification decisions,
performed effects, idempotency hints, and metered budgets.

## Implemented Source Surface

Ports can now declare policy labels next to their type:

```markdown
- `secret`: string [company_private.accounts] - private account data
- `summary`: Markdown<Summary> [public] - approved public summary
```

`### Access` remains a component-level policy declaration. Non-role access
rules, such as `reads`, `writes`, and `may_export`, are treated as data labels
for local propagation. `callable_by` remains role/caller policy and does not
flow as data.

## Runtime Behavior

- Caller input bindings receive component access data labels and port labels.
- Upstream bindings inherit upstream output labels.
- Provider requests receive effective policy labels and expected output labels.
- Outputs inherit all effective input labels unless the output port declares
  an explicit label set.
- Lowering labels blocks before provider execution unless the component
  declares `declassifies` and that effect is approved.
- Provider artifact records are written with runtime-computed labels, not only
  provider-supplied labels.
- Providers reporting undeclared or unapproved performed effects fail the run.

## Run Policy Record

New runs may include:

```json
{
  "policy": {
    "labels": ["company_private.accounts"],
    "input_labels": { "secret": ["company_private.accounts"] },
    "output_labels": { "summary": ["company_private.accounts"] },
    "declassifications": [],
    "budgets": [],
    "idempotency_keys": [],
    "performed_effects": [],
    "diagnostics": []
  }
}
```

Metered effects produce local budget declarations. Delivery and mutation
effects produce idempotency-key records with `declared` or `missing` status.
The OSS runtime records these facts; hosted enforcement can later turn them
into tenant-specific admission control.

## Tests

- Port label parsing in source IR.
- Private input labels propagate to run inputs, outputs, and artifact records.
- Private-to-public lowering blocks without approved `declassifies`.
- Approved `declassifies` records the lowering decision.
- Provider-reported undeclared performed effects fail the run.

## Commit And Signpost

- Commit this slice as `feat: enforce local OpenProse policy records`.
- Add signpost `030-policy-engine.md`.
- Push both the OSS branch and the parent platform gitlink.
