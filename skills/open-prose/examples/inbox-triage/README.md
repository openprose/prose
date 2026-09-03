# inbox-triage

**Architecture: diamond fan-in + failure isolation.** Domain: email / personal-ops.

> The same newsletter hits FIVE inboxes, summarized ONCE. One malformed email
> fails, your digest still ships.

The standing goal: keep a noisy multi-inbox mail feed triaged into one shipped
daily digest, paying only for what actually changed, and never letting one bad
email take the digest down.

## What it teaches

- **Diamond dedup = a single wake.** Five recipients receive the _same_
  newsletter. Each delivery lights its own classifier lane and re-runs the
  threader, but the threader's `thread:newsletter` facet fingerprints ONLY the
  canonical content, so it moves exactly once. The shared per-thread render fires
  ONCE; copies 2..5 dedup-skip. Many wakes fan IN, one wake comes OUT.
- **Failure isolation.** One email is malformed; its classifier render throws. The
  reconciler records a `failed` receipt that **carries zero fresh and wakes
  nothing downstream**. The threader re-groups over the healthy classifications,
  the digest still ships, and a later fixed re-delivery recovers (a fresh
  `rendered` receipt); failure stays contained in one node.
- **The dark lane.** A delivery to one inbox moves ONLY that email's
  `email:<id>` facet; every sibling classifier stays dark.

## DAG sketch

```
                 (raw mail feed)
                       │  email:<id>  (one facet per email, the dark lane)
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
                 │ Threader  │  thread:<key> facets, content-fingerprinted dedup
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
is acyclic. `src/` ships the 4 authored contracts and mounts 4 nodes on its own;
the 16-node / 27-edge topology is what the reference harness's per-entity
expansion produces from them (see the Harnesses section of the repository
README).

## Conformance expectations

A conforming harness proves dark sibling lanes, one render for duplicate
newsletter content, contained classifier failure with zero fresh propagation, a
digest built from healthy inputs, recovery, chain verification, and deterministic
replay.

A run leaves a keyless, chain-verifiable state on disk that any conforming
harness can replay (the universal "aha"):

```text
dispositions rendered=… · skipped=… · failed=1
the shared newsletter thread renders ONCE; copies 2..5 skip; one failed email; digest still ships
```

## What ships here

- `src/*.prose.md`: the gateway + classifier + threader + digest contracts.

A run writes a keyless, chain-verifiable state (topology, labels, beats,
receipts, world-models) that a conforming harness replays unchanged.
