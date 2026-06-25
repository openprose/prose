# Compliance Evidence Tracker

## Quick Start

```bash
prose compile
prose serve
```

## What This Repository Does

Keeps audit evidence fresh, reviewed, and gap-aware without turning compliance
into a last-minute scramble.

The repository checks required controls, gathers current evidence references,
flags stale or missing artifacts, and prepares a human-reviewable gap brief.

## Source Shape

- `src/`: the `compliance-evidence-current` responsibility, the
  `evidence-review-events` gateway, and the helper `function`s it `call`s
- `dist/`: compiled topology + canonicalizers produced by `prose compile`
- `runs/`: append-only receipt ledger
- `state/`: the canonical world-model (control evidence + register history)
- `deps/`: installed OpenProse dependencies
