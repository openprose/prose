# Research Inbox Triage

## Quick Start

```bash
prose compile
cp dist/manifest.next.json dist/manifest.active.json   # promote the compiled IR
prose serve
```

`prose serve` then waits for the `inbox-gateway` to fire: an inbound `POST
/inbox/items`, a local inbox item created or updated, or the weekday 09:00 check
for untriaged items, before anything renders.

## What This Repository Does

Keeps a research inbox deduplicated, prioritized, and converted into useful
next actions.

The repository reads papers, links, notes, and questions, clusters related
items, scores relevance, assigns follow-up, and preserves the reasoning behind
what was ignored.

## Source Shape

- `src/`: the `research-inbox-responsibility`, the `inbox-gateway`, and the
  helper `function`s it `call`s
- `dist/`: compiled topology + canonicalizers produced by `prose compile`
- `runs/`: append-only receipt ledger
- `state/`: the canonical world-model (topic map + ignored-item history)
- `deps/`: installed OpenProse dependencies
