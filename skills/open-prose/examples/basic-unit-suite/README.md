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

## Run it

The contract (`src/*.prose.md`) is harness-neutral. `prose compile` is the
intelligent phase: a session embodies the VM, Forme wires the DAG, and each
`### Maintains` lowers to a deterministic canonicalizer. `prose serve` runs the
dumb reconciler over that frozen IR. Any conforming harness can serve the
compiled IR the same way; compiling is the only step that spends model work.

```sh
prose compile                                          # the intelligent phase → the frozen DAG (7 nodes, 1 diamond)
cp dist/manifest.next.json dist/manifest.active.json   # promote the compiled IR
prose serve                                            # the dumb reconciler: a node renders iff its memo key moved
prose status                                           # dispositions, cost, recent runs
```

## Replay any run you produce

A run leaves a real, chain-verifiable state on disk. Any conforming harness can
replay it with no model key and describe what happened:

```text
dispositions rendered=… · skipped=… · failed=1
surprise-cause  external=… · input=… · self=…
cost rollup (tokens) …  chain-verify ok
```

A replayed state holds the compiled topology world-model (7 nodes, one
diamond, `acyclic:true`, single entry gateway), node-id labels, the flat
chain-verifiable receipt ledger, and per-node world-models (each with a
`published.json` plus a `versions/sha256_*.bin` history).

## The intelligent phase vs the dumb run

The session **embodies the VM**: it compiles the contracts into the deterministic
artifacts (topology, world-models, receipts). The dumb reconciler then just
replays them: a node renders **iff** its memo key
`(contract_fingerprint, input_fingerprints)` moved. The example is exercised by
the reference harness's offline replay suite, which drives the real reconciler
with deterministic fake renders (no key) and asserts byte-identical output, so
a drift between this contract and the harness fails in that harness's CI.
