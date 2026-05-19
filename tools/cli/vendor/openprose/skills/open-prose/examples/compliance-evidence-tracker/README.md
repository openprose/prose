# Compliance Evidence Tracker

## Quick Start

```bash
prose compile
cp dist/manifest.next.json dist/manifest.active.json
prose serve
```

## What This Repository Does

Keeps audit evidence fresh, reviewed, and gap-aware without turning compliance
into a last-minute scramble.

The repository checks required controls, gathers current evidence references,
flags stale or missing artifacts, and prepares a human-reviewable gap brief.

## Source Shape

- `src/`: responsibility, schedule gateway, evidence system, and services
- `dist/`: compiled intent produced by `prose compile`
- `runs/`: bounded activation receipts
- `state/`: durable control evidence status
- `deps/`: installed OpenProse dependencies
