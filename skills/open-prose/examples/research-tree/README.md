# research-tree

**Standing goal:** keep one current research answer, built bottom-up as a tree of
findings — and re-synthesize only the branch whose source actually moved.

**One-line scenario:** a research agent built its answer as a tree (raw sources →
findings → per-sub-question syntheses → one root answer); revise a single finding
three levels down and **only its ancestor path re-synthesizes** — the rest of the
tree stays dark.

This is the example for **structural recursion / propagation UP a recursive tree
with per-branch memoization**. The marquee frame: revise Finding `B2` and only
`B2 → Synthesis B → Root` lights; the seven sibling findings and Synthesis `A` &
`C` stay `skipped moved[—] fresh 0`. The lit path is bounded by tree **depth**,
never tree **size**.

## DAG sketch

```
                         Sources Gateway            (entry · external-driven)
                         one facet PER leaf
        leaf:A1 …             leaf:B2 …            leaf:C2
           │                    │                    │
   Finding A1  A2  A3    Finding B1  B2  B3    Finding C1  C2    (8 leaves)
        \    |    /          \    |    /          \    |  /
       Synthesis: A         Synthesis: B         Synthesis: C    (3 sub-syntheses)
            \                     │                    /
             \____________  Root Synthesis  __________/          (the apex)
```

Edges point **UP**: leaf → sub-synthesis → root. The gateway exposes one
**independent** facet per leaf, so revising one leaf's source moves exactly one
`leaf:<id>` facet and wakes exactly one finding — whose change propagates up only
*its* branch.

- `src/sources-gateway.prose.md` — the entry gateway; `### Continuity:
  external-driven`; projects the corpus into one `leaf:<id>` facet per finding.
- `src/finding.prose.md` — a leaf; subscribes to ONLY its own `leaf:<id>` facet; a
  corrupt excerpt fails the leaf and propagates nothing.
- `src/sub-synthesis.prose.md` — an interior node; fans in from its own
  sub-question's findings only (convergent fan-in wakes it once per drain).
- `src/root-synthesis.prose.md` — the apex; fans in from the three sub-syntheses;
  the heaviest node and the dominant fresh tick.

## Run it with the Reactor harness

The `.prose.md` contracts are harness-neutral; these verbs steer to the Reactor
harness. The committed `replay/` state-dir is keyless and replayable as-is.

```sh
reactor doctor                 # honest health report (the best command in the kit)
reactor compile --check        # exits 1 (stale) until the compile sessions run
reactor compile                # run the compile sessions -> the frozen DAG
reactor topology               # offline now: the compiled tree (gateway -> leaves -> sub-synth -> root)
reactor run                    # boot, drain, print dispositions + cost
reactor serve                  # expose the standing graph
reactor receipts verify        # chain-verify the committed ledger
```

Replay the committed episode (no key needed) in devtools:

```sh
reactor-devtools ./replay --describe
#   the bottom-up cold boot, the quiet skips, then the hero: revise one finding
#   and watch only its ancestor path re-synthesize.
```

## What to try

- Revise one leaf's source `rev`: only that finding → its sub-synthesis → the root
  re-render. The other branches `skip` at `fresh 0`.
- Revise a leaf under a *different* sub-question: a different path lights, the
  same root re-synthesizes.
- Corrupt a leaf's excerpt: the finding `fails`, carries zero fresh, and wakes no
  ancestor — the prior answer stands.

## The frozen artifacts (`replay/`)

```
replay/
  compile/topology.json   # the TopologyWorldModel (13 nodes, 20 edges, single
                          # entry gateway, acyclic) — MANDATORY for replay
  compile/labels.json     # nodeId -> friendly label
  receipts.json           # the flat, chain-verifiable ledger trail
  world-models/<hexNodeId>/published.json + versions/sha256_*.bin
  beats.json              # the scripted beat timeline (cold -> quiet -> surprise)
```

`generate.ts` drives the **real `@openprose/reactor` reconciler** with
deterministic fake renders (no key) to produce these bytes; it self-writes
`beats.json` so a regeneration is lossless. `research-tree.test.ts` is the
deterministic tier-2 gate: it asserts the topology compiles, a quiet re-wake
skips the whole tree at zero fresh, `cost.surprise_cause === wake.source` on
every receipt, the ledger chain-verifies, and two regenerations are
byte-identical — all offline, at zero spend.

```sh
cd /Users/sl/code/prose && REACTOR_OFFLINE=1 \
  npx vitest run skills/open-prose/examples/research-tree   # or: pnpm test:examples
```
