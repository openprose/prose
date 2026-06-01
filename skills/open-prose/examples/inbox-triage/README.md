# inbox-triage

**Architecture: diamond fan-in + failure isolation.** Domain: email / personal-ops.

> The same newsletter hits FIVE inboxes — summarized ONCE. One malformed email
> fails — your digest still ships.

The standing goal: keep a noisy multi-inbox mail feed triaged into one shipped
daily digest, paying only for what actually changed, and never letting one bad
email take the digest down.

## What it teaches

- **Diamond dedup = a single wake.** Five recipients receive the *same*
  newsletter. Each delivery lights its own classifier lane and re-runs the
  threader, but the threader's `thread:newsletter` facet fingerprints ONLY the
  canonical content — so it moves exactly once. The shared per-thread render fires
  ONCE; copies 2..5 dedup-skip. Many wakes fan IN, one wake comes OUT.
- **Failure isolation.** One email is malformed; its classifier render throws. The
  reconciler records a `failed` receipt that **carries zero fresh and wakes
  nothing downstream**. The threader re-groups over the healthy classifications,
  the digest still ships, and a later fixed re-delivery recovers (a fresh
  `rendered` receipt) — failure stays contained in one node.
- **The dark lane.** A delivery to one inbox moves ONLY that email's
  `email:<id>` facet; every sibling classifier stays dark.

## DAG sketch

```
                 (raw mail feed)
                       │  email:<id>  (one facet per email — the dark lane)
                 ┌─────▼─────┐
                 │ Inbox     │  gateway · external-driven · single entry point
                 │ Stream    │
                 └─────┬─────┘
        ┌──────┬───────┼───────┬───────┬──────┬─────────┐
        ▼      ▼       ▼        ▼       ▼      ▼         ▼
     [nl1]  [nl2] … [nl5]   [ship1] [invoice1] [bad1✗]      8 classifiers
        └──────┴───────┴───────┴───────┴──────┴─────────┘
                       │  (diamond fan-in)
                 ┌─────▼─────┐
                 │ Threader  │  thread:<key> facets — content-fingerprinted dedup
                 └──┬─────┬──┘
       thread:*     │     │   rollup
        ┌───┬───┬───┘     └────┐
        ▼   ▼   ▼               ▼
   [thread renders ×4]      [Priority]
        └─────────┬───────────┘
                  ▼
            ┌───────────┐
            │  Digest   │  terminal fan-in · ships from healthy threads
            └───────────┘
```

16 nodes / 27 edges. `gateway.inbox-stream` is the single entry point; the graph
is acyclic.

## Run it (Reactor flow)

The contracts in `src/` are harness-neutral; these verbs steer you through the
Reactor harness. Offline replay needs no key.

```sh
reactor doctor                 # honest health report (the best command in the kit)
reactor compile                # the intelligent phase: a session compiles src/*.prose.md
reactor topology               # the compiled DAG (gateway → classifiers → threader → digest)
reactor run                    # boot, drain, print dispositions + cost rollup
reactor serve                  # serve the receipts + world-models for inspection
reactor receipts verify        # chain-verify the ledger
```

Replay the committed, keyless fixture in devtools — the universal "aha":

```sh
reactor-devtools ./replay --describe
#   dispositions rendered=… · skipped=… · failed=1
#   the shared newsletter thread renders ONCE; copies 2..5 skip; one failed email; digest still ships
```

## What ships here

- `src/*.prose.md` — the gateway + classifier + threader + digest contracts.
- `replay/` — the committed, keyless, chain-verifiable state-dir (topology, labels,
  beats, receipts, world-models) that `reactor-devtools` replays unchanged.
- `generate.ts` — drives the **real** `@openprose/reactor` reconciler with
  deterministic fake renders (no key) and writes `replay/`. Regenerating is
  byte-identical to the committed bytes.
- `inbox-triage.test.ts` — the offline, zero-spend gate (the validity contract:
  topology, cold-render-then-skip, `cost.surprise_cause === wake.source`,
  `ATOMIC_FACET`, chain-verify, byte-determinism, and the failure-isolation
  invariant).
- `inbox-triage.live.test.ts` — optional key-gated live reliability check; a
  passing-skipped no-op offline.

To regenerate the committed `replay/` after a contract or SDK change:

```sh
tsx generate.ts
```
