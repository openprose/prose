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

## Conformance expectations

A conforming harness proves cold rendering, a byte-identical re-wake that skips
the gateway and leaves the digest dark at zero fresh cost, and one-hop
propagation when the gateway contract fingerprint changes.

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
