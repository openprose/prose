# Content Performance Loop

## Quick Start

```bash
prose compile
prose serve
```

## What This Repository Does

Keeps content performance evidence flowing into editorial decisions.

The repository reviews published content, traffic, conversion, distribution,
and audience signals, then produces a concise learning brief and next-action
queue.

## Source Shape

- `src/`: the `content-learning-cycle` responsibility, the
  `weekly-performance-review` gateway, and the helper `function`s it `call`s
- `dist/`: compiled topology + canonicalizers produced by `prose compile`
- `runs/`: append-only receipt ledger
- `state/`: the canonical world-model (learnings + recommendation history)
- `deps/`: installed OpenProse dependencies
