# Research Inbox Triage

## Quick Start

```bash
prose compile
cp dist/manifest.next.json dist/manifest.active.json
prose serve
```

## What This Repository Does

Keeps a research inbox deduplicated, prioritized, and converted into useful
next actions.

The repository reads papers, links, notes, and questions, clusters related
items, scores relevance, assigns follow-up, and preserves the reasoning behind
what was ignored.

## Source Shape

- `src/`: responsibility, inbox gateway, triage system, and services
- `dist/`: compiled intent produced by `prose compile`
- `runs/`: bounded activation receipts
- `state/`: durable inbox memory and topic map
- `deps/`: installed OpenProse dependencies
