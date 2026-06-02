# Competitor Activity Monitor

The canonical **named-parts (facet)** example: one `### Maintains` block that
declares three independently-subscribable facets as `####` sub-headings.

## Quick Start

```bash
prose compile
prose serve
```

## What This Repository Does

Keeps a current, corroborated view of each tracked competitor's material
activity — funding events, hiring activity, and product launches — and exposes
each as its own subscribable facet.

## The named-parts model

`src/competitor-activity-monitor.prose.md` declares its facets by **naming the
parts** of its truth: a `####` sub-heading inside `### Maintains` *is* a facet.
The author writes one name and gets three things at once
(`architecture.md` §3.2, the named-parts rule):

- the **fingerprint unit** — the compiled canonicalizer emits one token per
  `####` part, plus the always-on `@atomic` token over the whole truth;
- the **subscription symbol** — a consumer names it in `### Requires`, and the
  reconciler wakes that consumer only when *that* part's token moves
  (`Requires.<facet>` ↔ `Maintains.<facet>`);
- the **world-model subtree** — `published/<facet>/…`, so the on-disk directory
  structure literally shows the facets (`state/filesystem.md`).

A downstream that `### Requires` `funding-signals` and resolves to the
`#### funding` facet wakes only when funding moves — not when `#### hiring` or
`#### product-launches` move. The shared `name` / `last_corroborated` sit outside
any part, so they move only the `@atomic` token. This is React's selector
boundary made authorable (`world-model.md` §3, "Declaring facets").

## Source Shape

- `src/`: the `competitor-activity-monitor` responsibility with three `####`
  facet parts under `### Maintains`
- `dist/`: compiled topology + canonicalizers produced by `prose compile`
- `runs/`: append-only receipt ledger
- `state/`: the canonical world-model, laid out as `published/<facet>/…` subtrees
- `deps/`: installed OpenProse dependencies
