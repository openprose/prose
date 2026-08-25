# research-tree

**Standing goal:** keep one current research answer, built bottom-up as a tree of
findings, and re-synthesize only the branch whose source actually moved.

**One-line scenario:** a research agent built its answer as a tree (raw sources →
findings → per-sub-question syntheses → one root answer); revise a single finding
three levels down and **only its ancestor path re-synthesizes**, leaving the rest
of the tree dark.

This is the example for **structural recursion / propagation UP a recursive tree
with per-branch memoization**. The marquee frame: revise Finding `B2` and only
`B2 → Synthesis B → Root` lights; the seven sibling findings and Synthesis `A` &
`C` stay `skipped moved[] fresh 0`. The lit path is bounded by tree **depth**,
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
`leaf:<id>` facet and wakes exactly one finding, whose change propagates up only
_its_ branch.

- `src/sources-gateway.prose.md`: the entry gateway; `### Continuity:
external-driven`; projects the corpus into one `leaf:<id>` facet per finding.
- `src/finding.prose.md`: a leaf; subscribes to ONLY its own `leaf:<id>` facet; a
  corrupt excerpt fails the leaf and propagates nothing.
- `src/sub-synthesis.prose.md`: an interior node; fans in from its own
  sub-question's findings only (convergent fan-in wakes it once per drain).
- `src/root-synthesis.prose.md`: the apex; fans in from the three sub-syntheses;
  the heaviest node and the dominant fresh tick.

## Conformance expectations

A conforming harness proves quiet zero-fresh replay, one-leaf changes that wake
only the leaf's ancestor path, dark sibling branches, contained corrupt-leaf
failure, chain verification, and byte-identical regeneration.

A run leaves a state on disk that any conforming harness can replay keyless:

```text
the bottom-up cold boot, the quiet skips, then the hero: revise one finding
and watch only its ancestor path re-synthesize.
```

## What to try

- Revise one leaf's source `rev`: only that finding → its sub-synthesis → the root
  re-render. The other branches `skip` at `fresh 0`.
- Revise a leaf under a _different_ sub-question: a different path lights, the
  same root re-synthesizes.
- Corrupt a leaf's excerpt: the finding `fails`, carries zero fresh, and wakes no
  ancestor; the prior answer stands.

## The state-dir a run produces

```
<state-dir>/
  compile/topology.json   # the TopologyWorldModel (13 nodes, 20 edges, single
                          # entry gateway, acyclic): MANDATORY for replay
  compile/labels.json     # nodeId -> friendly label
  receipts.json           # the flat, chain-verifiable ledger trail
  world-models/<hexNodeId>/published.json + versions/sha256_*.bin
  beats.json              # the scripted beat timeline (cold -> quiet -> surprise)
```
