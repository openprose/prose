# Content Performance Loop

## Quick Start

```bash
prose compile
cp dist/manifest.next.json dist/manifest.active.json
prose serve
```

## What This Repository Does

Keeps content performance evidence flowing into editorial decisions.

The repository reviews published content, traffic, conversion, distribution,
and audience signals, then produces a concise learning brief and next-action
queue.

## Source Shape

- `src/`: responsibility, schedule gateway, performance system, and services
- `dist/`: compiled intent produced by `prose compile`
- `runs/`: bounded activation receipts
- `state/`: durable content performance history
- `deps/`: installed OpenProse dependencies
