# Customer Risk Radar

## Quick Start

```bash
prose compile
cp dist/manifest.next.json dist/manifest.active.json
prose serve
```

## What This Repository Does

Keeps customer risk visible before churn, renewal, or escalation windows become
urgent.

The repository combines usage changes, support friction, stakeholder movement,
commercial context, and account notes into explainable risk briefs with
recommended next actions.

## Source Shape

- `src/`: responsibility, weekly gateway, risk system, and services
- `dist/`: compiled intent produced by `prose compile`
- `runs/`: bounded activation receipts
- `state/`: durable account risk history
- `deps/`: installed OpenProse dependencies
