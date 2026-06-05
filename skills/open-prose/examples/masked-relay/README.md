# masked-relay

**Standing goal:** keep a living weekly "non-obvious customer insight" memo from a
messy bundle of customer calls, support tickets, lost-deal notes, and competitor
changes, while preventing early consensus collapse by hiding a different
deterministic subset of prior notes from each downstream worker.

**One-line scenario:** a 12-node peer-blind relay where scouts fan out over a
shared signal ledger without seeing each other, a masker projects a different
masked view to each expander, critics and a synthesizer converge over the trail,
and a terminal auditor diagnoses coverage, all replayable to the byte.

This is the **full-vocabulary canonical** example. It teaches: wide **peer-blind
fan-out**, **deterministic masked projections** as named per-consumer facets, a
**diamond fan-in**, and a **full-provenance commit** at the synthesizer.

## DAG sketch (12 nodes / 23 edges)

```text
Signal Inbox (gateway, external-driven)
        | ledger
        v
Signal Ledger
        |  (atomic)            three scouts, peer-blind: no scout reads a sibling
   +----+----+----+
   v         v    v
Scout·Price  …Friction  …Desire
   \         |    /
    \        |   /        diamond fan-in
     v       v  v
   Viewport Masker  -- projects view_e1 and view_e2 (named facets)
        | view_e1        | view_e2     selector boundaries: each lane wakes ONE expander
        v                v
   Expander 1        Expander 2
        \               /            diamond fan-in
         +-----+   +----+
         v     v   v    v
      Critic·Strong  Critic·Weak     peer-blind toward each other
              \       /
               v     v
        Insight Synthesizer  -- FULL provenance: sees the whole trail, names what moved
               |
               v
        Diversity Auditor    -- terminal diagnostic; no cycle back to the masker
```

The masker's two named facets (`view_e1`, `view_e2`) are real topology edges: a
move in `view_e1` lights only Expander 1's lane. Facet-less producers expose their
whole truth on the atomic facet (`@atomic`), never a `"*"` wildcard, which would
silently never propagate.

## Replay any run you produce (the universal "aha")

A `reactor run` (or `reactor serve`) writes a chain-verifiable, keyless ledger.
Point the devtools at it:

```sh
reactor-devtools <state-dir> --describe
#   dispositions rendered=… · skipped=… · failed=0
#   surprise-cause  external=… · input=…
#   COST ROLLUP (tokens) fresh spikes on a surprise, flat on a quiet re-wake
#   CHAIN-VERIFY ok
```

The marquee frame is the quiet re-wake: `skipped  moved[]  fresh 0`, **the
gateway skips and nothing downstream wakes** when no signal moved. (Watch the
ledger: `ingress.signal-inbox`, the phantom external producer, still re-renders
each cycle at `fresh 0`; it shows `rendered=4 / skipped=0` across the run, but
because the real `gateway.signal-inbox` memo-skips, that skip starves every node
below it. Nothing downstream pays a token.) Cost scales with surprise, not the
clock.

### Cost rollup: the three `byCause` buckets

`costRollup.byCause` partitions every fresh token by the _wake source_ that paid
for it, and `cost.surprise_cause` always equals that source (the check asserts the
invariant on every receipt). There are exactly three buckets:

- **`external`**: the gateway woke because the outside world moved (a new signal
  landed in the inbox). The relay's only entry point.
- **`input`**: an interior node woke because an upstream producer's facet moved
  under it. Every fan-out, masked projection, and fan-in node bills here.
- **`self`**: a node woke itself (timer or internal re-derivation, independent of
  any upstream move). **This relay is purely external-driven, so `self == 0`.**

The check pins `byCause.self.fresh === 0`: if a future edit ever introduces a
self-wake, the offline test goes red and forces the topology change to be
declared on purpose.

## The reactor flow (compile → run from the contract)

The `.prose.md` contract under `src/` works with any harness; these verbs steer to
the Reactor harness.

### Offline (no key needed)

```sh
reactor doctor                 # honest health report (the best command in the kit)
reactor compile --check        # exits 1 (stale) until the project is compiled
reactor topology               # the compiled DAG once frozen (12 nodes / 23 edges)
```

### Live (needs OPENROUTER_API_KEY + @openai/agents + zod)

```sh
reactor compile                # the SKILL session compiles src/ → the IR cache
reactor run                    # boot, drain, print dispositions + cost
reactor serve                  # stand the relay up; wake it on new signals
reactor receipts verify        # chain-verify the on-disk ledger
```

## What the offline check proves

The example is covered by the project's offline test suite, which drives the REAL
`@openprose/reactor` reconciler with deterministic fake renders (no key) and
asserts the validity contract:

1. compiles to the frozen artifact set (valid `TopologyWorldModel`: 12 nodes, 23
   edges, single entry gateway, acyclic; `labels.json` + flat `receipts.json` +
   `world-models/<hexNodeId>/…`);
2. cold-start renders all nodes; an identical re-wake **skips all** (a skip
   propagates nothing, wakes nothing);
3. `cost.surprise_cause === wake.source` on every receipt;
4. `ATOMIC_FACET` for facet-less producers; no `"*"` tokens anywhere;
5. `verifyReceiptChain` passes over the raw on-disk receipts;
6. byte-deterministic: a second generation yields identical
   `receipts.json` / `topology.json` / `labels.json` / `beats.json`.
