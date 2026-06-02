# surprise-cost

**The standing goal:** maintain a digest that re-writes its brief *only when
something actually happened* — a cron-replacement that costs nothing on a quiet
re-wake and spends fresh tokens exactly once when the world moves.

**One-line scenario:** a `signals` gateway watches an external feed; a `digest`
responsibility subscribes to it. Re-wake with the same signal and the gateway
memo-**skips** (the marquee `skipped · moved[—] · fresh 0` frame); move the
contract and the digest re-renders and the surprise propagates one hop.

This is the worked, executable form of `packages/reactor/EVALS.md` — the smallest
graph that teaches the central claim: **a node renders if and only if its memo
key `(contract_fingerprint, input_fingerprints)` moved**, so fresh model spend
scales with *surprise*, not the clock.

## The DAG

```
signals (gateway, external-driven)         ── the entry point
   │ @atomic                               ── the ATOMIC_FACET (never "*")
   ▼
digest  (responsibility, input-driven)     ── re-writes ONLY when signals moves
```

Two nodes, one atomic edge, over **one shared ledger**. The whole lesson lives in
the receipt trail.

## The beat arc (the committed `replay/`)

| epoch | what happens | dispositions | fresh |
|---|---|---|---|
| **cold** | the world wakes up | `signals:rendered`, `digest:rendered` | +2 |
| **quiet** | an identical re-wake | `signals:skipped` *(digest never woken)* | +0 |
| **surprise** | the contract moves | `signals:rendered`, `digest:rendered` | +2 |

The quiet epoch is the marquee frame: the gateway memo-skips, **moves no facet**,
**wakes nothing**, and **burns zero fresh**. You cannot drive a surprise by
re-waking an external entry node whose contract is fixed — it renders once and
skips forever. To drive surprise you **move the memo key** (the surprise epoch
bumps the gateway's `contract_fingerprint` over the *same* ledger).

## Run it with the Reactor harness

The `.prose.md` contracts work with any harness; these verbs steer to Reactor.

```sh
reactor doctor                 # honest health report (sandbox, IR presence)
reactor compile --check        # exits 1 (stale): recognized, not yet compiled
reactor compile                # run the compile session -> IR cache (needs a key)
reactor topology               # offline: the compiled DAG (signals -> digest)
reactor run                    # boot, drain, print dispositions + cost
reactor receipts               # the audit trail (rendered / skipped / fresh)
reactor serve                  # browse the receipts + world-models locally
```

Replay the committed keyless fixture (no key, one second) in devtools:

```sh
reactor-devtools ./replay --describe
#   dispositions rendered=4 · skipped=1 · failed=0
#   surprise-cause  external=3 · input=2
#   COST ROLLUP (tokens)  fresh=...  CHAIN-VERIFY ok
```

## What to try

- **Re-wake with no change** and watch `total.fresh` stay flat — the skip costs
  nothing.
- **Edit the gateway contract** (its `contract_fingerprint`) and watch the digest
  re-render and the fresh meter tick once: the surprise propagated.
- Confirm `cost.surprise_cause === wake.source` on every receipt — the cause of
  the spend is the wake that drove it, read off `ctx.wake.source`, never hardcoded.

## How it's built & tested

- `src/*.prose.md` — the harness-neutral contracts (the gateway + the digest).
- `generate.ts` — drives the **real `@openprose/reactor` reconciler** with
  deterministic fake renders (no key) through the public SDK
  (`createFileSystemStorageAdapter` → `createFileSystemReceiptLedger` →
  `mountDag` → `dag.ingest`) and writes the committed `replay/` state-dir,
  including a self-written `beats.json` so a regeneration is lossless.
- `replay/` — the committed, keyless, chain-verifiable artifacts: a flat
  `receipts.json`, a `registry.json` runtime-registry snapshot (empty `{}` here —
  no live runtime is mounted; the storage adapter writes it, so a regen
  reproduces it), `compile/topology.json` + `compile/labels.json`, and
  `world-models/<hexNodeId>/{published.json, versions/sha256_*.bin}` — the exact
  shape `reactor-devtools` replays.
- `surprise-cost.test.ts` — the deterministic tier-2 gate (offline, zero spend).
  Its body mirrors this README; if it breaks, the README is wrong — fix both.
- `surprise-cost.live.test.ts` — an optional tier-3 reliability check, key-gated
  (a passing-skipped no-op when offline / keyless).
