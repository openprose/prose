# forme-fixpoint

**Standing goal:** keep the harness's own responsibility graph wired correctly
(as a maintained, versioned, auditable truth) without ever letting an invalid
topology candidate corrupt how the runtime schedules nodes.

**One-line scenario:** the Reactor harness wires _itself_ with Forme: contract
source files and operator pins flow in, a Contract Registry parses them, and the
**Topology Maintainer (Forme)** validates a _candidate_ graph and commits it as
the **active graph**, but only when the candidate is valid. An ambiguous
producer or a cycle is rejected into diagnostics while the last valid active
graph stands.

This is the strange heart of the architecture: **topology is not a hidden config
file; it is a maintained world-model.** The tenet it teaches is
**topology-as-world-model**, with the **active/candidate split** and **The
Cradle** (a deterministic seed + a fixed reconciler are the non-recursive ground
that terminates the self-reference).

## The DAG

```text
            external                       external
   Contract Source Files            Operator Pins
        (gateway)                      (gateway)
            |                               |
            | @atomic                       |
            v                               |
     Contract Registry                      |
        (responsibility)                    |
            |                               |
            | contract-set facet            | @atomic
            v                               v
        +------> Topology Maintainer (Forme) <------+
                 (responsibility)
                 publishes a versioned TopologyModel
                 with TWO independent facets:
                   • active-graph  (moves only on an ACCEPTED candidate)
                   • diagnostics   (moves on a rejected ambiguity/cycle)
                        |
          +-------------+--------------------+----------------------+
          | active-graph ONLY                | active-graph + diagnostics
          v                                  v                      v
    Schedule Plan                  Topology Change Reporter   Topology Safety Auditor
   (responsibility)                  (responsibility)           (responsibility)
```

**The Cradle.** The reconciler is _not a node_; it is the fixed runtime that
reads the latest **valid committed** `active_graph` and schedules ordinary nodes
from it. The deterministic seed mounts the control plane (the two gateways, the
registry, and the topology maintainer) _before any application graph exists_. The
committed active graph includes the topology maintainer itself, yet it never
depends on its own _uncommitted_ output. Forme may produce the topology; the seed
and reconciler are fixed ground.

## The load-bearing lesson: the active/candidate split

The Topology Maintainer exposes two **independent facets**:

| facet          | moves when…                                         | who subscribes                                 |
| -------------- | --------------------------------------------------- | ---------------------------------------------- |
| `active-graph` | a _valid_ candidate is **accepted**                 | Schedule Plan, Change Reporter, Safety Auditor |
| `diagnostics`  | an ambiguity/cycle changes (a _rejected_ candidate) | Change Reporter, Safety Auditor                |

The **Schedule Plan subscribes to `active-graph` ONLY.** So when Forme rejects an
ambiguous producer or a cycle, only `diagnostics` moves; the Schedule Plan
**memo-skips**, and scheduling stays over the last valid graph. **Invalid
candidates cannot corrupt scheduling.** That is the whole fixpoint safety
property, asserted off the persisted ledger.

## The beat timeline

1. **cold-start**: the seed wires the control plane; Forme commits the first
   valid active graph (self-inclusive).
2. **quiet**: byte-identical source re-scans; the whole graph memo-skips; Forme
   never wakes.
3. **immaterial-edit**: a reflowed comment bumps the raw inbox but the registry's
   `contract-set` facet holds, so Forme memo-skips (topology memoization).
4. **valid-addition**: a new responsibility (`risk-digest`) consuming the
   existing `StrategyMemo` facet; the candidate stays valid, so Forme **accepts**
   it; `active-graph` **moves**; the Schedule Plan replans.
5. **ambiguous-candidate**: a duplicate `CompetitorActivity` producer; Forme
   **rejects** the candidate; `active-graph` **held**; the Schedule Plan skips.
6. **operator-pin**: a human pins the intended producer; Forme commits the new
   valid active graph.
7. **bad-cycle**: a 2-node cycle; Forme **rejects** again; `active-graph` held;
   the Schedule Plan skips; the prior valid graph stands.
8. **final-quiet**: back to flat; steady on the last valid active graph.

## Try it (the reactor flow)

The `.prose.md` contracts in `src/` are harness-neutral; the commands below steer
to the Reactor harness.

```sh
reactor doctor                 # honest health report (sandbox, IR presence)
reactor compile                # the intelligent compile -> the frozen IR/topology
reactor topology               # the compiled DAG (offline): 7 nodes, 2 entry gateways
reactor run                    # boot, drain, print dispositions + cost
reactor serve                  # the live world-model + receipt surface
reactor receipts verify        # chain-verify the on-disk ledger
```

A `reactor run` (or `reactor serve`) writes a chain-verifiable state-dir you can
replay keyless in devtools to watch the active/candidate split animate (a rejected
candidate moves diagnostics, the schedule never re-renders):

```sh
reactor-devtools <state-dir> --describe
```

## What ships here

- `src/*.prose.md`: the seven contracts (two gateways + five responsibilities).

A replayed state-dir holds the compiled topology and labels, the flat
chain-verifiable receipt ledger, and per-node world-models. The example is also
covered by the project's offline test suite, which drives the **real
`@openprose/reactor` reconciler** with deterministic fake renders (no key) and
asserts the full validity contract: it compiles, cold-renders then skips,
`cost.surprise_cause === wake.source`, `ATOMIC_FACET` (no `"*"`), chain-verify,
byte-determinism, and the active/candidate split. An optional, key-gated
reliability check covers the same flow live (a passing-skipped no-op offline or
keyless).

## Scope note (conservative deterministic version)

This ships the **conservative deterministic** form of the fixpoint: the active
graph is committed as a versioned truth and invalid candidates (ambiguous
producers, cycles) are rejected without corrupting scheduling, all replayable
keyless. The full _self-hosting_ fixpoint, where Forme is itself a model render
that re-derives its own contract from sources at runtime, is future WIP; here
Forme's resolution/validation is a pure deterministic function so the replay is
byte-deterministic and runs at zero model spend.
