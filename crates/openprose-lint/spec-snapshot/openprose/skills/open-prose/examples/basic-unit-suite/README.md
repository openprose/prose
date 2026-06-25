# basic-unit-suite

The **substrate** example. It is the smallest graph that exercises _every_
micro-mechanic the bigger examples stand on, so the larger systems have something
solid to stand on. If a harness cannot pass this, it is not ready to run
Masked Relay, the Agent State Observatory, Forme Fixpoint, or the eval harness.

**Standing goal:** keep an executive snapshot of a counter feed current (the
summary, the alert, the trend, and the audit) while spending fresh tokens only on
the slice an event actually moved.

**Scenario (one line):** counter events arrive at a gateway; a summary → alert →
projection chain, a raw-event auditor, and a self-rechecking trend all feed a
single executive snapshot, and each re-render happens only when its memo key
moves.

## DAG sketch

```text
ingress.counter-events            (phantom external feed, NOT a node)
        │ atomic
counter-events  (gateway)  ── facets: counts , raw_events
   ├─ counts ─────────▶ count-summary ─▶ alert-state ─▶ alert-projection
   │                         │                                (calls Format Alert
   │                         └─ counts ─▶ count-trend           Copy internally)
   └─ raw_events ─────▶ raw-event-auditor
                              ╲          ╷          ╱
   executive-snapshot ◀───────┘   (DIAMOND fan-in: alert-state +
                                    raw-event-audit + count-trend)
```

`Format Alert Copy` is a **called function**, not a node; nothing subscribes to
it (U07).

## What it teaches (the acceptance cases U00–U12)

| Case    | Mechanic                                                                           | Where to see it                                                         |
| ------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| U01/U02 | gateway ingress + single responsibility render                                     | the cold-start cascade                                                  |
| U03     | **memo skip**: a byte-identical re-wake skips                                      | gateway `skipped`, fresh 0                                              |
| U04     | linear propagation in DAG order                                                    | counts move → summary → alert → projection                              |
| U05     | **facet subscription**: `raw_events` moves, `counts` does not                      | only the auditor wakes                                                  |
| U06     | **diamond single-wake**: render once per tuple                                     | executive-snapshot                                                      |
| U07     | **function boundary**: a helper is not a node                                      | `format-alert-copy`                                                     |
| U08     | **projection boundary**: a cosmetic re-render moves `@atomic` but not `structured` | the projection re-renders, `structured` stays flat, no subscriber wakes |
| U09     | **self-continuity**: a no-op self recheck propagates nothing                       | count-trend self-tick                                                   |
| U10     | **failure containment**: a failed receipt corrupts no prior truth                  | alert-state `failed`                                                    |
| U12     | **deterministic replay**: byte-identical regeneration                              | a replayed run reproduces the same receipt ledger                       |

## Run it with the Reactor harness

The contract (`src/*.prose.md`) is harness-neutral; the flow below steers toward
the Reactor CLI. Offline needs no model key.

```sh
reactor doctor                 # honest health report (sandbox, IR presence)
reactor compile --check        # exits 1 (stale) until the project is compiled
reactor compile                # run the compile sessions -> IR cache (needs a key)
reactor topology               # offline now: the compiled DAG (7 nodes, 1 diamond)
reactor run                    # boot, drain, print dispositions + cost
reactor serve                  # browse the standing world-models + receipts
reactor receipts verify        # chain-verify the on-disk ledger
```

## Replay any run you produce

A `reactor run` (or `reactor serve`) writes a real, chain-verifiable state-dir.
Replay it with no model key using `reactor-devtools <state-dir> --describe`:

```sh
reactor-devtools <state-dir> --describe
#   dispositions rendered=… · skipped=… · failed=1
#   surprise-cause  external=… · input=… · self=…
#   COST ROLLUP (tokens) …  CHAIN-VERIFY ok
```

A replayed state-dir holds the compiled `TopologyWorldModel` (7 nodes, one
diamond, `acyclic:true`, single entry gateway), node-id labels, the flat
chain-verifiable receipt ledger, and per-node world-models (each with a
`published.json` plus a `versions/sha256_*.bin` history).

## The intelligent phase vs the dumb run

The session **embodies the VM**: it compiles the contracts into the deterministic
artifacts (topology, world-models, receipts). The dumb reconciler then just
replays them: a node renders **iff** its memo key
`(contract_fingerprint, input_fingerprints)` moved. The example is exercised by
the project's offline test suite, which drives the real `@openprose/reactor`
reconciler with deterministic fake renders (no key) and asserts byte-identical
output, so a drift against the real SDK fails in CI.
