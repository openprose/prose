# Incident Briefing Room

## Quick Start

```bash
prose compile
prose serve
```

## What This Repository Does

Keeps an incident response channel current with sourced status, customer impact,
open decisions, and next actions.

The repository turns alerts, deploy notes, support signals, and operator updates
into calm incident briefs, then maintains continuity until the incident is
resolved and ready for retrospective.

## Source Shape

- `src/`: the `incident-channel-current` responsibility, the `incident-events`
  gateway, and the helper `function`s it `call`s
- `dist/`: compiled topology + canonicalizers produced by `prose compile`
- `runs/`: append-only receipt ledger
- `state/`: the canonical world-model (incident timeline + decision log)
- `deps/`: installed OpenProse dependencies
