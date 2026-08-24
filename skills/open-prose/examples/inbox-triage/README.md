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
is acyclic.

## Run it

The contracts in `src/` are harness-neutral. `prose compile` is the intelligent
phase: a session embodies the VM and Forme wires the DAG (gateway → classifiers
→ threader → digest) into the frozen IR. `prose serve` runs the dumb reconciler
over it. Any conforming harness can serve the compiled IR the same way;
replaying a run needs no key.

```sh
prose compile                                          # the intelligent phase → the frozen 16-node / 27-edge DAG
cp dist/manifest.next.json dist/manifest.active.json   # promote the compiled IR
prose serve                                            # the dumb reconciler: a node renders iff its memo key moved
prose status                                           # dispositions, cost rollup, recent runs
```

A run leaves a keyless, chain-verifiable state on disk that any conforming
harness can replay (the universal "aha"):

```text
dispositions rendered=… · skipped=… · failed=1
the shared newsletter thread renders ONCE; copies 2..5 skip; one failed email; digest still ships
```

## What ships here

- `src/*.prose.md`: the gateway + classifier + threader + digest contracts.

A run writes a keyless, chain-verifiable state (topology, labels, beats,
receipts, world-models) that a conforming harness replays unchanged. The
example is also covered by the reference harness's offline replay suite, which
drives the **real** reconciler with deterministic fake renders (no key) and
asserts the validity contract: topology, cold-render-then-skip,
`cost.surprise_cause === wake.source`, `ATOMIC_FACET`, chain-verify,
byte-determinism, and the failure-isolation invariant. An optional, key-gated live
reliability check covers the same flow (a passing-skipped no-op offline).
