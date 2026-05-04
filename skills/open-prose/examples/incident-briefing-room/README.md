# Incident Briefing Room

## Quick Start

```bash
prose compile
cp dist/manifest.next.json dist/manifest.active.json
prose serve
```

## What This Repository Does

Keeps an incident response channel current with sourced status, customer impact,
open decisions, and next actions.

The repository turns alerts, deploy notes, support signals, and operator updates
into calm incident briefs, then maintains continuity until the incident is
resolved and ready for retrospective.

## Source Shape

- `src/`: responsibility, gateway, briefing system, and services
- `dist/`: compiled intent produced by `prose compile`
- `runs/`: bounded activation receipts
- `state/`: durable incident timeline and decision log
- `deps/`: installed OpenProse dependencies
