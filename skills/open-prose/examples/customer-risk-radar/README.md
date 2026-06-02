# Customer Risk Radar

## Quick Start

```bash
prose compile
prose serve
```

## What This Repository Does

Keeps customer risk visible before churn, renewal, or escalation windows become
urgent.

The repository combines usage changes, support friction, stakeholder movement,
commercial context, and account notes into explainable risk briefs with
recommended next actions.

## Source Shape

- `src/`: the `customer-risk-maintained` responsibility, the
  `customer-risk-review` gateway, and the helper `function`s it `call`s
- `dist/`: compiled topology + canonicalizers produced by `prose compile`
- `runs/`: append-only receipt ledger
- `state/`: the canonical world-model (account risk + decision history)
- `deps/`: installed OpenProse dependencies
