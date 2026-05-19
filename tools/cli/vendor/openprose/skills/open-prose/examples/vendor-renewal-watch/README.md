# Vendor Renewal Watch

## Quick Start

```bash
prose compile
cp dist/manifest.next.json dist/manifest.active.json
prose serve
```

## What This Repository Does

Keeps vendor renewals prepared before auto-renewal dates, cancellation windows,
or negotiation deadlines.

The repository tracks renewal dates, usage, owner sentiment, spend changes, and
alternatives, then prepares renewal briefs with recommended decisions.

## Source Shape

- `src/`: responsibility, schedule gateway, renewal system, and services
- `dist/`: compiled intent produced by `prose compile`
- `runs/`: bounded activation receipts
- `state/`: durable vendor renewal state
- `deps/`: installed OpenProse dependencies
