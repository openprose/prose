# Author a scenario / write a surprise-cost eval

The post asks for one thing above all: *a responsibility, and an evaluation,
where the harness should pass and does not yet.* This is how you build one by
hand from the public SDK — drive the dumb reconciler yourself, wake a graph,
read back the dispositions and the cost rollup, then replay the resulting ledger
in devtools.

Everything below uses only the package's public exports — the root
`@openprose/reactor` barrel (which re-exports the storage adapters) and its
`/sdk` subpath. See the `"exports"` map in `package.json`. No private internals.
The snippet below is run verbatim in this package's test suite, so it works as
written.

## The shape of an eval

A surprise-cost eval is a sequence of wakes against a mounted DAG plus an
assertion about which nodes **rendered** (spent tokens) vs **skipped** (memoized
at zero fresh cost), and what the cost rolls up to **by `surprise_cause`**. The
property you are probing: *a node renders if and only if its memo key
`(contract_fingerprint, input_fingerprints)` actually moved.*

## Drive the reconciler yourself

```ts
import { createFileSystemStorageAdapter } from "@openprose/reactor";
import {
  mountDag,
  createFileSystemReceiptLedger,
  createReplaySession,
  files,
  textFile,
  ATOMIC_FACET,
  type ReconcilerTopology,
  type RenderContext,
} from "@openprose/reactor/sdk";

// (Plain CommonJS? The package is `type: commonjs`, so the same names come from
//  `const { mountDag, ATOMIC_FACET } = require("@openprose/reactor/sdk")`.)

// 1. A receipt ledger that persists to a directory you can replay later. The
//    ledger appends through a storage adapter; the filesystem one writes the
//    trail to `<directory>/receipts.json` (+ a `registry.json`).
const storage = createFileSystemStorageAdapter({ directory: "./eval.reactor" });
const ledger = createFileSystemReceiptLedger({ storage });

// 2. A render body per node: `(context) => RenderProduct`. It returns the
//    candidate world-model `files` and a mechanical `cost`. Keep it
//    deterministic for an eval — you are testing the RECONCILER, not a model.
//    IMPORTANT: `cost.surprise_cause` MUST equal `context.wake.source` (the
//    harness verifies this invariant on commit), so read it off the context.
const render = (text: string) => (ctx: RenderContext) => ({
  world_model: files({ "out.txt": textFile(text) }),
  cost: {
    provider: "none",
    model: "fake",
    tokens: { fresh: 1, reused: 0 },
    surprise_cause: ctx.wake.source,
  },
});

// 3. Mount the topology Forme would produce. A `ReconcilerTopology` is
//    `{ topology: { nodes, edges, entry_points, acyclic }, contract_fingerprints }`.
//    Edges are resolved subscriptions: subscriber -> producer, on a named facet.
//    A facet-less producer exposes its whole truth as the atomic facet, so an
//    edge subscribes to `ATOMIC_FACET` (NOT a "*" wildcard — an unknown facet
//    token silently never propagates).
const topology: ReconcilerTopology = {
  topology: {
    nodes: [
      { node: "source", contract_fingerprint: "fp-source", wake_source: "external" },
      { node: "digest", contract_fingerprint: "fp-digest", wake_source: "input" },
    ],
    edges: [{ subscriber: "digest", producer: "source", facet: ATOMIC_FACET }],
    entry_points: ["source"],
    acyclic: true,
  },
  contract_fingerprints: { source: "fp-source", digest: "fp-digest" },
};

const dag = mountDag({
  topology,
  mounts: {
    source: { render: render("v1") },
    digest: { render: render("digest of v1") },
  },
  ledger,
});

// 4. Run a sequence of wakes. `ingest(node)` delivers an external wake and
//    reconciles to a fixpoint, returning per-node `ReconcileResult`s.
const first = dag.ingest("source");   // cold-start: source renders, digest renders
const second = dag.ingest("source");  // nothing moved: source SKIPS (digest isn't even woken)
```

## Read back dispositions + the cost rollup

```ts
// ReconcileResult.disposition is "rendered" | "skipped" | "failed" | "coalesced".
console.log(first.map((r) => `${r.node}:${r.disposition}`).join(", "));
//   -> source:rendered, digest:rendered
console.log(second.map((r) => `${r.node}:${r.disposition}`).join(", "));
//   -> source:skipped         (a skipped producer propagates nothing, so digest stays quiet)

// The cumulative cost rollup, bucketed by surprise_cause, off the ledger:
const replay = createReplaySession({ ledger });
console.log(replay.costRollup.total.fresh); // 2 — two cold renders; the skip cost 0 fresh
// replay.costRollup is { byCause: { input, self, external }, total } — each
// bucket { receipts, fresh, reused, dollars }.
```

The assertion that proves the thesis: the second `ingest("source")` must **skip**
and `replay.costRollup.total.fresh` must **not move**. If it *renders* when
nothing material changed, you have found an edge — exactly the eval worth sending.

## A worked epoch: a change that should render *and* propagate

The other half of the property: when the memo key genuinely moves, the node
renders and its downstream wakes. Edit the source's contract (a new
`contract_fingerprint`) and re-mount over the **same** persisted ledger — the
trail re-derives the last receipts, so only what changed re-renders:

```ts
const topology2: ReconcilerTopology = {
  topology: {
    nodes: [
      { node: "source", contract_fingerprint: "fp-source-v2", wake_source: "external" },
      { node: "digest", contract_fingerprint: "fp-digest", wake_source: "input" },
    ],
    edges: [{ subscriber: "digest", producer: "source", facet: ATOMIC_FACET }],
    entry_points: ["source"],
    acyclic: true,
  },
  contract_fingerprints: { source: "fp-source-v2", digest: "fp-digest" },
};
const dag2 = mountDag({
  topology: topology2,
  mounts: {
    source: { render: render("v2") },          // produces a moved world-model
    digest: { render: render("digest of v2") },
  },
  ledger,
});
const third = dag2.ingest("source");
console.log(third.map((r) => `${r.node}:${r.disposition}`).join(", "));
//   -> source:rendered, digest:rendered   (memo MISS on the new contract_fp; the
//      moved truth wakes digest)
console.log(createReplaySession({ ledger }).costRollup.total.fresh); // 4 — two more renders
```

So: quiet wakes skip (cost flat), a real change renders and propagates (cost
moves), and the whole thing is auditable off the ledger you just wrote.

## Replay the ledger you just wrote

The in-process `createReplaySession(...)` IS the read view devtools renders, so an
eval can assert directly on `replay.costRollup` and the per-node chains without
shelling out. To eyeball it in the keyless devtools `--describe` surface:

```sh
reactor-devtools ./eval.reactor --describe
#   dispositions rendered=4 · skipped=1 · failed=0
#   surprise-cause  external=3 · input=2
#   COST ROLLUP (tokens) ...  CHAIN-VERIFY ok
```

> Your hand-mounted ledger has no `compile/topology.json` (that comes from
> `reactor compile`), so devtools draws a **node-only** graph (nodes, no edges) —
> the dispositions, cost rollup, and chain-verify are all still real. For the
> full edge-lit graph, replay a `reactor compile`/`run` state-dir, or assert
> in-process on `createReplaySession(...)`, which is the identical data.

## Notes on the public surface

- The exports used here are from `@openprose/reactor` / `@openprose/reactor/sdk`
  (the `mountDag` front door, `createFileSystemReceiptLedger`, the
  `createReplaySession` read view, the `files`/`textFile` world-model helpers, and
  `ATOMIC_FACET`). For the full set of subpaths see the `"exports"` map in
  `package.json`.
- The async live path (`ingestAsync`/`tickAsync` + the `asyncMounts` field on the
  mount input) swaps the deterministic render for a bounded LLM session; the
  reconciler semantics are identical.

Send us the eval where Reactor *should* skip and doesn't, or *should* render and
doesn't — that is the most useful thing you can hand us.
