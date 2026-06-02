# basic-unit-suite

The **substrate** example. It is the smallest graph that exercises *every*
micro-mechanic the bigger examples stand on, so the larger systems have something
solid to stand on. If a harness cannot pass this, it is not ready to run
Masked Relay, the Agent State Observatory, Forme Fixpoint, or the eval harness.

**Standing goal:** keep an executive snapshot of a counter feed current — the
summary, the alert, the trend, and the audit — while spending fresh tokens only on
the slice an event actually moved.

**Scenario (one line):** counter events arrive at a gateway; a summary → alert →
projection chain, a raw-event auditor, and a self-rechecking trend all feed a
single executive snapshot — and each re-render happens only when its memo key
moves.

## DAG sketch

```text
ingress.counter-events            (phantom external feed — NOT a node)
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

`Format Alert Copy` is a **called function**, not a node — nothing subscribes to
it (U07).

## What it teaches (the acceptance cases U00–U12)

| Case | Mechanic | Where to see it |
|---|---|---|
| U01/U02 | gateway ingress + single responsibility render | the cold-start cascade |
| U03 | **memo skip** — a byte-identical re-wake skips | gateway `skipped`, fresh 0 |
| U04 | linear propagation in DAG order | counts move → summary → alert → projection |
| U05 | **facet subscription** — `raw_events` moves, `counts` does not | only the auditor wakes |
| U06 | **diamond single-wake** — render once per tuple | executive-snapshot |
| U07 | **function boundary** — a helper is not a node | `format-alert-copy` |
| U08 | **projection boundary** — a cosmetic re-render moves `@atomic` but not `structured` | committed frame: the projection re-renders, `structured` stays flat, no subscriber wakes |
| U09 | **self-continuity** — a no-op self recheck propagates nothing | count-trend self-tick |
| U10 | **failure containment** — a failed receipt corrupts no prior truth | alert-state `failed` |
| U12 | **deterministic replay** — byte-identical regeneration | `generate.ts` |

## Run it with the Reactor harness

This example ships a committed, keyless, chain-verifiable `replay/` state-dir, so
you can replay it in one second with no model key. The contract (`src/*.prose.md`)
is harness-neutral; the flow below steers toward the Reactor CLI.

```sh
reactor doctor                 # honest health report (sandbox, IR presence)
reactor compile --check        # exits 1 (stale) until the project is compiled
reactor compile                # run the compile sessions -> IR cache (needs a key)
reactor topology               # offline now: the compiled DAG (7 nodes, 1 diamond)
reactor run                    # boot, drain, print dispositions + cost
reactor serve                  # browse the standing world-models + receipts
reactor receipts verify        # chain-verify the on-disk ledger
```

Replay the committed fixture (no key) in devtools:

```sh
reactor-devtools ./replay --describe
#   dispositions rendered=… · skipped=… · failed=1
#   surprise-cause  external=… · input=… · self=…
#   COST ROLLUP (tokens) …  CHAIN-VERIFY ok
```

## What ships in `replay/` (the committed state-dir)

The `replay/` directory is the frozen devtools state-dir — the exact shape
`reactor-devtools` replays and a judge inspects:

| Artifact | What it is |
|---|---|
| `compile/topology.json` | the compiled `TopologyWorldModel` (7 nodes, resolved facet edges, one diamond, `acyclic:true`, single entry gateway) |
| `compile/labels.json` | node-id → human label for the SPA |
| `receipts.json` | the **flat** root receipt ledger (the full beat trajectory, chain-verifiable) |
| `world-models/<hexNodeId>/` | each node's `published.json` + `versions/sha256_*.bin` history (node ids are hex-encoded, e.g. `gateway.counter-events` → `676174657761792e636f756e7465722d6576656e7473`) |
| `beats.json` | the scripted beat timeline (cold-start → memo-skip → … → failure-containment), self-written by `generate.ts` so a regen is lossless |
| `registry.json` | **intentionally empty (`{}`)**. This is the canonical *empty runtime registry* snapshot that `createFileSystemStorageAdapter` initializes — the shrunk runtime registry (topology world-model + self-driven schedule) carries no entries for a keyless replay fixture. It is present and `{}` by design, matching every `reactor-devtools` fixture; a downstream index must treat `{}` as a valid empty registry, **not** a missing one. |

## The intelligent phase vs the dumb run

The session **embodies the VM**: it compiles the contracts into the deterministic
artifacts under `replay/` (topology, world-models, receipts). `generate.ts` is the
regeneration script — it drives the **real `@openprose/reactor` reconciler** with
deterministic fake renders (no key) and writes the state-dir. The dumb reconciler
then just replays them: a node renders **iff** its memo key
`(contract_fingerprint, input_fingerprints)` moved. The deterministic test
(`basic-unit-suite.test.ts`) regenerates `replay/` and asserts it is byte-identical
to the committed bytes — so a drift against the real SDK fails in CI.

## Reuse

This example doubles as the shared substrate for the corpus: `generate.ts` exports
its node-id constants (`GATEWAY`, `COUNT_SUMMARY`, …) and the
`generateBasicUnitSuiteFixture` helper, so other tests can import a known-good
graph instead of re-deriving one.
