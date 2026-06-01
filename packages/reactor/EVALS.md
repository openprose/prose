# Author a scenario / write a surprise-cost eval

The post asks for one thing above all: *a responsibility, and an evaluation,
where the harness should pass and does not yet.* This is how you build one by
hand from the public SDK — drive the dumb reconciler yourself, wake a graph,
read back the dispositions and the cost rollup, then replay the resulting ledger
in devtools.

Everything below uses only the package's public exports — the root
`@openprose/reactor` barrel (which re-exports the storage adapters) and its
`/sdk` subpath. See the `"exports"` map in `package.json`. No private internals.

## The shape of an eval

A surprise-cost eval is a sequence of wakes against a mounted DAG plus an
assertion about which nodes **rendered** (spent tokens) vs **skipped** (memoized
at zero fresh cost), and what the cost rolls up to **by `surprise_cause`**. The
property you are probing: *a node renders if and only if its memo key
`(contract_fp, input_fps)` actually moved.*

## Drive the reconciler yourself

```ts
import { createFileSystemStorageAdapter } from "@openprose/reactor";
import {
  mountDag,
  createFileSystemReceiptLedger,
  createReplaySession,
  textFile,
  files,
  type MountDagInput,
  type RenderContext,
} from "@openprose/reactor/sdk";

// 1. A receipt ledger that persists to a directory you can replay later. The
//    ledger appends through a storage adapter; the filesystem one writes the
//    trail to `<directory>/receipts.json` (+ a `registry.json`). (For a pure
//    in-process eval, swap in the exported `InMemoryReceiptLedger` instead.)
const storage = createFileSystemStorageAdapter({ directory: "./eval.reactor" });
const ledger = createFileSystemReceiptLedger({ storage });

// 2. A render body per node. A render is `(context) => RenderProduct`:
//    it returns the candidate world-model `files`, an optional `semantic_diff`,
//    and a mechanical `cost`. Keep it deterministic for an eval — you are
//    testing the RECONCILER, not the model. (A live render is the async sibling;
//    see the `asyncMounts` field on `MountDagInput`.)
const render = (text: string) => (_ctx: RenderContext) => ({
  world_model: files({ "out.txt": textFile(text) }),
  cost: {
    provider: "none",
    model: "fake",
    tokens: { fresh: 0, reused: 0 },
    surprise_cause: "external" as const,
  },
});

// 3. Mount the topology Forme would produce. `topology` is `{ nodes, edges,
//    entry_points, acyclic }`; `contract_fingerprints` is one fingerprint per
//    node. Edges are resolved subscriptions: subscriber → producer, by facet.
const input: MountDagInput = {
  topology: {
    topology: {
      nodes: [
        { node: "source", contract_fingerprint: "fp-source", wake_source: "external" },
        { node: "digest", contract_fingerprint: "fp-digest", wake_source: "input" },
      ],
      edges: [{ subscriber: "digest", producer: "source", facet: "*" }],
      entry_points: ["source"],
      acyclic: true,
    },
    contract_fingerprints: { source: "fp-source", digest: "fp-digest" },
  },
  mounts: {
    source: { render: render("v1") },
    digest: { render: render("digest of v1") },
  },
  ledger,
};

const dag = mountDag(input);

// 4. Run a sequence of wakes. Each `ingest`/`tick` reconciles to a fixpoint and
//    returns per-node `ReconcileResult`s carrying a `disposition`.
const first = dag.ingest("source");        // cold-start: source renders, digest renders
const second = dag.ingest("source");       // nothing moved: both SKIP (zero fresh cost)
```

## Read back dispositions + the cost rollup

```ts
// Each ReconcileResult.disposition is "rendered" | "skipped" | "failed" | "coalesced".
for (const r of [...first, ...second]) {
  console.log(r.node, r.disposition);
}

// The cumulative cost rollup, bucketed by surprise_cause, straight off the ledger:
const replay = createReplaySession({ ledger });
console.log(replay.cost);   // per-cause buckets (input / self / external) + total
```

Assert what you expect: e.g. the second `ingest("source")` should produce
`skipped` for both nodes, and the rollup's fresh-token total should not move. If
it *renders* when nothing material changed, you have found an edge — that is
exactly the eval worth sending.

## Replay the ledger you just wrote

The same in-process read view devtools renders is `createReplaySession`, so an
eval can assert directly on `replay.cost` and the per-node chains without
shelling out. To eyeball it in the keyless devtools `--describe` surface (the
one the README quickstart uses), point it at a state-dir holding the persisted
receipt trail:

```sh
reactor-devtools ./eval.reactor --describe
# per-node rendered/skipped dispositions, cost rollup by surprise_cause, chain-verify
```

> Devtools reads a receipt ledger from a state-dir; the bundled fixtures pair the
> receipts with a `compile/topology.json`. If `--describe` reports the dir isn't
> a state-dir, assert in-process on `createReplaySession(...)` instead — it is the
> identical ordering / diff / cost-rollup view.

## Notes on the public surface

- The exports used here come from `@openprose/reactor` / `@openprose/reactor/sdk`
  (the `mountDag` front door, `createFileSystemReceiptLedger`, the
  `createReplaySession` read view, and the `files`/`textFile` world-model
  helpers). For the full set of subpaths see the
  [Public Subpaths](./README.md#public-subpaths) section and the `"exports"` map
  in `package.json`.
- For a single-node, no-graph eval, use `renderAtom(...)` from the same `/sdk`
  barrel — one session, no harness, a fingerprinted receipt.
- The async live path (`ingestAsync`/`tickAsync` + `asyncMounts`) swaps the fake
  render for a bounded LLM session; the reconciler semantics are identical.

Send us the eval where Reactor *should* skip and doesn't, or *should* render and
doesn't — that is the most useful thing you can hand us.
