# surprise-cost

**The standing goal:** maintain a digest that re-writes its brief _only when
something actually happened_: a cron-replacement that costs nothing on a quiet
re-wake and spends fresh tokens exactly once when the world moves.

**One-line scenario:** a `signals` gateway watches an external feed; a `digest`
responsibility subscribes to it. Re-wake with the same signal and the gateway
memo-**skips** (the marquee `skipped · moved[] · fresh 0` frame); move the
contract and the digest re-renders and the surprise propagates one hop.

This is the smallest graph that teaches the central claim: **a node renders if and
only if its memo key `(contract_fingerprint, input_fingerprints)` moved**, so fresh
model spend scales with _surprise_, not the clock.

## The DAG

```
signals (gateway, external-driven)         ── the entry point
   │ @atomic                               ── the ATOMIC_FACET (never "*")
   ▼
digest  (responsibility, input-driven)     ── re-writes ONLY when signals moves
```

Two nodes, one atomic edge, over **one shared ledger**. The whole lesson lives in
the receipt trail.

## The beat arc

| epoch        | what happens         | dispositions                             | fresh |
| ------------ | -------------------- | ---------------------------------------- | ----- |
| **cold**     | the world wakes up   | `signals:rendered`, `digest:rendered`    | +2    |
| **quiet**    | an identical re-wake | `signals:skipped` _(digest never woken)_ | +0    |
| **surprise** | the contract moves   | `signals:rendered`, `digest:rendered`    | +2    |

The quiet epoch is the marquee frame: the gateway memo-skips, **moves no facet**,
**wakes nothing**, and **burns zero fresh**. You cannot drive a surprise by
re-waking an external entry node whose contract is fixed; it renders once and
skips forever. To drive surprise you **move the memo key** (the surprise epoch
bumps the gateway's `contract_fingerprint` over the _same_ ledger).

## Run it

The `.prose.md` contracts work with any harness. `prose compile` is the
intelligent phase: a session embodies the VM and Forme wires the two-node DAG
(signals → digest) into the frozen IR. `prose serve` runs the dumb reconciler
over it; its receipt ledger is the audit trail (rendered / skipped / fresh).
Any conforming harness can serve the compiled IR the same way.

```sh
prose compile                                          # the intelligent phase → the frozen DAG (signals → digest)
cp dist/manifest.next.json dist/manifest.active.json   # promote the compiled IR
prose serve                                            # the dumb reconciler: a node renders iff its memo key moved
prose status                                           # dispositions, cost, the receipt trail
```

A run leaves a keyless state on disk that any conforming harness can replay:

```text
dispositions rendered=4 · skipped=1 · failed=0
surprise-cause  external=3 · input=2
cost rollup (tokens)  fresh=...  chain-verify ok
```

## What to try

- **Re-wake with no change** and watch `total.fresh` stay flat; the skip costs
  nothing.
- **Edit the gateway contract** (its `contract_fingerprint`) and watch the digest
  re-render and the fresh meter tick once: the surprise propagated.
- Confirm `cost.surprise_cause === wake.source` on every receipt; the cause of
  the spend is the wake that drove it, read off `ctx.wake.source`, never hardcoded.

## How it's built & exercised

- `src/*.prose.md`: the harness-neutral contracts (the gateway + the digest).
- A run writes a keyless, chain-verifiable state-dir: a flat `receipts.json`, a
  `registry.json` runtime-registry snapshot (empty `{}` here, since no live runtime
  is mounted; the storage adapter writes it, so a regen reproduces it),
  `compile/topology.json` + `compile/labels.json`, and
  `world-models/<hexNodeId>/{published.json, versions/sha256_*.bin}`, the exact
  shape a conforming harness replays.

The example is covered by the reference harness's offline replay suite, which
drives the **real reconciler** with deterministic fake renders (no key) through
that harness's public SDK (storage adapter → receipt ledger → mount the DAG →
ingest). Its body mirrors this README; if it breaks, the README is wrong, so
fix both. An optional, key-gated reliability check covers the same flow live (a
passing-skipped no-op when offline or keyless).
