# Vendor Renewal Watch

> The **canonical multi-slice eval example** for the mounted-responsibility model.
> It exercises every load-bearing piece end to end: a responsibility maintaining a
> standing world-model, a fingerprint-driven skip, a `function` call helper, a
> `gateway` for external input, **facets** that route propagation, and a memory
> ledger holding decision history + watermark state.

## Quick Start

```bash
prose compile      # the intelligent phase: Forme wires the DAG, compiles the
                   # canonicalizers + postcondition validators (topology world-model)
prose serve        # the dumb phase: the reconciler compares fingerprints and
                   # wakes only the nodes whose subscribed inputs moved
```

## What This Repository Does

Keeps every vendor renewal prepared before its auto-renewal date, cancellation
window, or negotiation deadline closes, by maintaining a durable world-model of
each vendor's renewal posture and decision history, and re-deriving only the part
that genuinely changed.

## The DAG

Forme wires these mounted nodes by matching `### Requires ↔ ### Maintains` (no
`system`, no `### Wiring`):

```
renewal-review-events  (gateway, external-driven entry point)
        │  maintains: renewal_events
        ▼
collect-renewal-signals  (responsibility, watermark in its world-model)
        │  maintains: renewal_signals   ← re-deliveries leave the fingerprint
        ▼                                  unmoved ⇒ downstream SKIPS
vendor-renewals-prepared  (responsibility, the headline)
        │  maintains a faceted vendor ledger:
        │    recommendation · history · ownership
        │  calls score-vendor-renewal (function helper) per vendor
        ▼  (subscribe to the `recommendation` facet only)
prepare-renewal-brief  (responsibility, wakes on posture moves,
                        not on decision-history churn)
```

## What it demonstrates (the eval slices)

- **A responsibility maintaining a world-model**: `vendor-renewals-prepared`
  reads its prior ledger _by reference_, folds in moved signals, and commits the
  next truth; the receipt is the commit downstreams wake on.
- **Fingerprint-driven skip**: `collect-renewal-signals` carries a watermark as
  _immaterial_ state; a re-delivered event does not move `renewal_signals`, so the
  assessor writes a `skipped` receipt and spawns nothing (_cost scales with
  surprise, not the clock_).
- **A `function` helper**: `score-vendor-renewal` is a called, stateless render
  (a reusable library helper), invoked via ProseScript `call`, not a subscribed
  node.
- **A `gateway` for external input**: `renewal-review-events` is sugar for an
  external-driven responsibility; Forme registers it as the DAG entry point off
  its `### Continuity: external-driven`.
- **Facets**: the ledger's `recommendation` / `history` / `ownership` facets let
  the brief writer wake on posture moves while an audit consumer could wake on
  `history` appends, selective propagation instead of a fan-out storm.
- **A memory ledger holding decision history + watermark state**: the old
  `### Memory` ledger is folded into the persisted world-model (decision history
  in the assessor's truth; the watermark in the collector's truth).

## Source Shape

- `src/`: one gateway, three responsibilities, and one `function` helper
- `dist/`: compiled intent (topology world-model + canonicalizers + validators)
  produced by `prose compile`
- `runs/`: bounded receipts (`rendered` / `skipped` / `failed`)
- `state/`: the durable world-model store (the canonical artifact)
- `deps/`: installed OpenProse dependencies
