# Competitor Activity Monitor

The canonical **named-parts (facet)** example: one `### Maintains` block that
declares three independently-subscribable facets as `####` sub-headings.

## Quick Start

```bash
prose compile
cp dist/manifest.next.json dist/manifest.active.json   # promote the compiled IR
prose serve
```

`prose serve` then waits for the `signal-feeds` gateway to fire: a webhook
delivery or the 6h feed poll that carries a funding, hiring, or launch item the
monitor has not seen. A re-poll that returns the same items moves no facet, so
nothing downstream renders (the monitor's own 6h self-driven re-check only
re-derives truth those inputs already produced).

## What This Repository Does

Keeps a current, corroborated view of each tracked competitor's material
activity (funding events, hiring activity, and product launches) and exposes
each as its own subscribable facet.

## The named-parts model

`src/competitor-activity-monitor.prose.md` declares its facets by **naming the
parts** of its truth: a `####` sub-heading inside `### Maintains` _is_ a facet.
The author writes one name and gets three things at once
(`architecture.md` §3.2, the named-parts rule):

- the **fingerprint unit**: the compiled canonicalizer emits one token per
  `####` part, plus the always-on `@atomic` token over the whole truth;
- the **subscription symbol**: a consumer names it in `### Requires`, and the
  reconciler wakes that consumer only when _that_ part's token moves
  (`Requires.<facet>` ↔ `Maintains.<facet>`);
- the **world-model subtree**: `published/<facet>/…`, so the on-disk directory
  structure literally shows the facets (`state/filesystem.md`).

A downstream that `### Requires` the monitor's funding truth resolves to the
`#### funding` facet and wakes only when funding moves, not when `#### hiring`
or `#### product-launches` move. The monitor itself subscribes the same way one
level up: its three needs resolve, facet by facet, to the `signal-feeds`
gateway's `#### funding-signals`, `#### hiring-signals`, and
`#### launch-signals` parts. The shared `name` / `last_corroborated` sit outside
any part, so they move only the `@atomic` token. This is React's selector
boundary made authorable (`world-model.md` §3, "Declaring facets").

## Source Shape

- `src/`: the `signal-feeds` gateway (three `####` signal facets, the entry
  point) and the `competitor-activity-monitor` responsibility that subscribes to
  them facet by facet and declares three `####` facet parts of its own under
  `### Maintains`
- `dist/`: compiled topology + canonicalizers produced by `prose compile`
- `runs/`: append-only receipt ledger
- `state/`: the canonical world-model, laid out as `published/<facet>/…` subtrees
- `deps/`: installed OpenProse dependencies
