// Tests for the dumb reconciler (the run-phase spine).
//
// These exercise the reconciler against in-memory fakes for its injected ports
// (architecture.md §5.3: "tests inject fakes"). They prove the four jobs of the
// reconciler (architecture.md §4.1): memo/skip, single-flight + coalescing,
// commit, and propagation — plus the load-bearing invariant that the skip
// decision is pure fingerprint comparison with no judge (delta.md §A0).
//
// Run: `pnpm --filter @openprose/reactor build` then
//      `node --test dist/reactor/__tests__/reconciler.test.js`
// (the package's `test:runtime` script builds then runs all dist *.test.js).

import { deepEqual, equal, ok } from "node:assert/strict";
import { test } from "node:test";

import {
  ATOMIC_FACET,
  type Cost,
  type ContentAddress,
  type Fingerprint,
  type FingerprintMap,
  type InputFingerprints,
  type Receipt,
  type TopologyEdge,
  type TopologyWorldModel,
  type Wake,
  type WorldModelCommit,
  type WorldModelRef, asFacet, asFingerprint, asNodeId} from "../../shapes";
import {
  type ReconcilerPorts,
  type ReconcilerTopology,
  type RenderOutcome,
  type RenderRequest,
  type WakeEvent,
  COLD_START_ATOMIC_FINGERPRINT,
  computeHeights,
  createReconciler,
  inboundEdges,
  memoKeyMoved,
  movedFacetsBetween,
  propagationTargets,
} from "../index";
import { resolveInputs } from "../../sdk/mounted-dag";

// --------------------------------------------------------------------------
// Fakes
// --------------------------------------------------------------------------

const CONTRACT_A = "sha256:" + "a".repeat(64);
const CONTRACT_B = "sha256:" + "b".repeat(64);

function atomic(token: string): FingerprintMap {
  return { [ATOMIC_FACET]: asFingerprint(token) };
}

const RENDER_COST: Cost = {
  provider: "test",
  model: "test-model",
  tokens: { fresh: 100, reused: 0 },
  surprise_cause: "input",
};

/** A node-scoped append-only ledger with content addressing by insertion id. */
class FakeLedger {
  private readonly byNode = new Map<string, Receipt[]>();
  private readonly addresses = new Map<Receipt, ContentAddress>();
  private seq = 0;

  lastReceipt = (node: string): Receipt | null => {
    const chain = this.byNode.get(node);
    if (chain === undefined || chain.length === 0) {
      return null;
    }
    return chain[chain.length - 1] as Receipt;
  };

  append = (receipt: Receipt): ContentAddress => {
    this.seq += 1;
    const address = ("sha256:" +
      String(this.seq).padStart(64, "0")) as ContentAddress;
    this.addresses.set(receipt, address);
    const chain = this.byNode.get(receipt.node) ?? [];
    chain.push(receipt);
    this.byNode.set(receipt.node, chain);
    return address;
  };

  addressOf = (receipt: Receipt): ContentAddress | null =>
    this.addresses.get(receipt) ?? null;

  chain = (node: string): readonly Receipt[] => this.byNode.get(node) ?? [];
}

function fakeWorldModelRef(node: string): WorldModelRef {
  return {
    node: asNodeId(node),
    workspace: "published",
    location: `/wm/${node}`,
    version: null,
  };
}

/**
 * Build the reconciler ports + topology around a programmable render and a
 * programmable input-fingerprint resolver. `renders` maps a node to a queue of
 * outcomes; each render shifts the next outcome (default: a fresh atomic move).
 */
function harness(input: {
  topology: TopologyWorldModel;
  contract_fingerprints: Record<string, Fingerprint>;
  inputs?: Record<string, InputFingerprints>;
  renders?: Record<string, RenderOutcome[]>;
  onRender?: (req: RenderRequest) => void;
}): {
  ports: ReconcilerPorts;
  topo: ReconcilerTopology;
  ledger: FakeLedger;
  renderCount: () => number;
  setInputs: (node: string, ifs: InputFingerprints) => void;
} {
  const ledger = new FakeLedger();
  const inputs: Record<string, InputFingerprints> = { ...(input.inputs ?? {}) };
  const renders: Record<string, RenderOutcome[]> = input.renders ?? {};
  let renderCount = 0;
  let renderSeq = 0;

  const ports: ReconcilerPorts = {
    ledger,
    worldModel: { publishedRef: (node) => fakeWorldModelRef(node) },
    resolveInputFingerprints: (node, _edges) => inputs[node] ?? [],
    spawnRender: (req) => {
      renderCount += 1;
      renderSeq += 1;
      input.onRender?.(req);
      const queued = renders[req.node];
      if (queued !== undefined && queued.length > 0) {
        return queued.shift() as RenderOutcome;
      }
      const commit: WorldModelCommit = {
        node: asNodeId(req.node),
        version: ("sha256:" +
          ("c".repeat(63) + String(renderSeq % 10))) as ContentAddress,
        fingerprints: atomic(`v${renderSeq}`),
      };
      return {
        status: "rendered",
        commit,
        semantic_diff: {},
        cost: RENDER_COST,
      };
    },
  };

  const topo: ReconcilerTopology = {
    topology: input.topology,
    contract_fingerprints: input.contract_fingerprints,
  };

  return {
    ports,
    topo,
    ledger,
    renderCount: () => renderCount,
    setInputs: (node, ifs) => {
      inputs[node] = ifs;
    },
  };
}

const inputWake: Wake = { source: "input", refs: [] };
const externalWake: Wake = { source: "external", refs: [] };

// --------------------------------------------------------------------------
// memoKeyMoved — the pure skip decision (no judge)
// --------------------------------------------------------------------------

function receiptWith(
  contract_fingerprint: string,
  input_fingerprints: readonly string[],
): Receipt {
  return {
    node: asNodeId("n"),
    contract_fingerprint: asFingerprint(contract_fingerprint),
    wake: inputWake,
    input_fingerprints: input_fingerprints.map(asFingerprint),
    fingerprints: atomic("x"),
    semantic_diff: {},
    prev: null,
    status: "rendered",
    cost: RENDER_COST,
    sig: { scheme: "none", null_reason: "test" },
  };
}

test("memoKeyMoved: unchanged contract + inputs ⇒ not moved (skip)", () => {
  const last = receiptWith(asFingerprint(CONTRACT_A), ["i1", "i2"]);
  equal(
    memoKeyMoved(last, {
      contract_fingerprint: CONTRACT_A,
      input_fingerprints: ["i1", "i2"],
    }),
    false,
  );
});

test("memoKeyMoved: a moved input fingerprint ⇒ moved (render)", () => {
  const last = receiptWith(asFingerprint(CONTRACT_A), ["i1", "i2"]);
  equal(
    memoKeyMoved(last, {
      contract_fingerprint: CONTRACT_A,
      input_fingerprints: ["i1", "i2-PRIME"],
    }),
    true,
  );
});

test("memoKeyMoved: a moved contract fingerprint ⇒ moved (schema migration = forced render)", () => {
  const last = receiptWith(asFingerprint(CONTRACT_A), ["i1"]);
  equal(
    memoKeyMoved(last, {
      contract_fingerprint: CONTRACT_B,
      input_fingerprints: ["i1"],
    }),
    true,
  );
});

test("memoKeyMoved: input arity change ⇒ moved", () => {
  const last = receiptWith(asFingerprint(CONTRACT_A), ["i1"]);
  equal(
    memoKeyMoved(last, {
      contract_fingerprint: CONTRACT_A,
      input_fingerprints: ["i1", "i2"],
    }),
    true,
  );
});

// --------------------------------------------------------------------------
// movedFacetsBetween — only moved facets propagate
// --------------------------------------------------------------------------

test("movedFacetsBetween: cold start (null prior) moves every published facet", () => {
  const moved = movedFacetsBetween(null, { [ATOMIC_FACET]: asFingerprint("v1"), price: asFingerprint("p1") });
  ok(moved.has(ATOMIC_FACET));
  ok(moved.has(asFacet("price")));
  equal(moved.size, 2);
});

test("movedFacetsBetween: unchanged facets are not moved", () => {
  const moved = movedFacetsBetween(
    { [ATOMIC_FACET]: asFingerprint("v1"), price: asFingerprint("p1") },
    { [ATOMIC_FACET]: asFingerprint("v2"), price: asFingerprint("p1") },
  );
  ok(moved.has(ATOMIC_FACET));
  ok(!moved.has(asFacet("price")));
  equal(moved.size, 1);
});

// --------------------------------------------------------------------------
// propagationTargets — wake downstreams subscribed to a moved facet
// --------------------------------------------------------------------------

test("propagationTargets: only subscribers of a moved facet are woken, once each", () => {
  const topology: TopologyWorldModel = {
    nodes: [],
    edges: [
      { subscriber: asNodeId("down1"), producer: asNodeId("up"), facet: ATOMIC_FACET },
      { subscriber: asNodeId("down2"), producer: asNodeId("up"), facet: asFacet("price") },
      { subscriber: asNodeId("down1"), producer: asNodeId("up"), facet: asFacet("price") },
      { subscriber: asNodeId("other"), producer: asNodeId("elsewhere"), facet: ATOMIC_FACET },
    ],
    entry_points: [],
    acyclic: true,
  };
  const targets = propagationTargets({
    topology,
    producer: "up",
    movedFacets: new Set([ATOMIC_FACET, asFacet("price")]),
    wakeRef: ("sha256:" + "9".repeat(64)) as ContentAddress,
  });
  // down1 (atomic + price) woken once; down2 (price) woken; other not woken.
  equal(targets.length, 2);
  const names = targets.map((t) => t.node).sort();
  deepEqual(names, ["down1", "down2"]);
  ok(targets.every((t) => t.wake.source === "input"));
});

test("propagationTargets: a facet with no subscriber propagates to nothing", () => {
  const topology: TopologyWorldModel = {
    nodes: [],
    edges: [{ subscriber: asNodeId("down"), producer: asNodeId("up"), facet: asFacet("price") }],
    entry_points: [],
    acyclic: true,
  };
  const targets = propagationTargets({
    topology,
    producer: "up",
    movedFacets: new Set([asFacet("unsubscribed")]),
    wakeRef: ("sha256:" + "9".repeat(64)) as ContentAddress,
  });
  equal(targets.length, 0);
});

test("inboundEdges: returns only edges where the node is the subscriber", () => {
  const topology: TopologyWorldModel = {
    nodes: [],
    edges: [
      { subscriber: asNodeId("n"), producer: asNodeId("a"), facet: ATOMIC_FACET },
      { subscriber: asNodeId("n"), producer: asNodeId("b"), facet: ATOMIC_FACET },
      { subscriber: asNodeId("m"), producer: asNodeId("a"), facet: ATOMIC_FACET },
    ],
    entry_points: [],
    acyclic: true,
  };
  const edges = inboundEdges(topology, "n");
  equal(edges.length, 2);
  ok(edges.every((e: TopologyEdge) => e.subscriber === "n"));
});

// --------------------------------------------------------------------------
// reconcile — cold start renders, then skips on unmoved inputs
// --------------------------------------------------------------------------

const singleNodeTopology: TopologyWorldModel = {
  nodes: [{ node: asNodeId("n"), contract_fingerprint: asFingerprint(CONTRACT_A), wake_source: "input" }],
  edges: [],
  entry_points: [],
  acyclic: true,
};

test("reconcile: cold start (no prior receipt) always renders", () => {
  const h = harness({
    topology: singleNodeTopology,
    contract_fingerprints: { n: asFingerprint(CONTRACT_A) },
    inputs: { n: [asFingerprint("i1")] },
  });
  const r = createReconciler(h.ports, h.topo);
  const result = r.reconcile({ node: "n", wake: inputWake });
  equal(result.disposition, "rendered");
  equal(h.renderCount(), 1);
  equal(result.receipt?.status, "rendered");
});

test("reconcile: unmoved inputs ⇒ SKIP, no render, cheap receipt (cost scales with surprise)", () => {
  const h = harness({
    topology: singleNodeTopology,
    contract_fingerprints: { n: asFingerprint(CONTRACT_A) },
    inputs: { n: [asFingerprint("i1")] },
  });
  const r = createReconciler(h.ports, h.topo);
  r.reconcile({ node: "n", wake: inputWake }); // cold render
  const second = r.reconcile({ node: "n", wake: inputWake }); // inputs unmoved
  equal(second.disposition, "skipped");
  equal(h.renderCount(), 1, "no second render — the skip spawned nothing");
  equal(second.receipt?.status, "skipped");
  // A skip carries zero cost and the empty semantic diff (architecture.md §8).
  equal(second.receipt?.cost.tokens.fresh, 0);
  equal(second.receipt?.cost.tokens.reused, 0);
  deepEqual(second.receipt?.semantic_diff, {});
});

test("reconcile: a skip copies the prior fingerprints forward and chains prev", () => {
  const h = harness({
    topology: singleNodeTopology,
    contract_fingerprints: { n: asFingerprint(CONTRACT_A) },
    inputs: { n: [asFingerprint("i1")] },
  });
  const r = createReconciler(h.ports, h.topo);
  const first = r.reconcile({ node: "n", wake: inputWake });
  const second = r.reconcile({ node: "n", wake: inputWake });
  deepEqual(
    second.receipt?.fingerprints,
    first.receipt?.fingerprints,
    "skip copies unchanged fingerprints forward",
  );
  equal(
    second.receipt?.prev,
    first.receipt_ref,
    "the skip chains to the last receipt",
  );
});

test("reconcile: a moved input fingerprint ⇒ a fresh render", () => {
  const h = harness({
    topology: singleNodeTopology,
    contract_fingerprints: { n: asFingerprint(CONTRACT_A) },
    inputs: { n: [asFingerprint("i1")] },
  });
  const r = createReconciler(h.ports, h.topo);
  r.reconcile({ node: "n", wake: inputWake }); // cold render
  h.setInputs("n", [asFingerprint("i2")]); // upstream moved
  const second = r.reconcile({ node: "n", wake: inputWake });
  equal(second.disposition, "rendered");
  equal(h.renderCount(), 2);
});

// --------------------------------------------------------------------------
// reconcile — failure commits nothing and does not propagate
// --------------------------------------------------------------------------

test("reconcile (failure path): failed render keeps prior truth and does not propagate", () => {
  const diamondTopology: TopologyWorldModel = {
    nodes: [],
    edges: [{ subscriber: asNodeId("down"), producer: asNodeId("n"), facet: ATOMIC_FACET }],
    entry_points: [],
    acyclic: true,
  };
  const h = harness({
    topology: diamondTopology,
    contract_fingerprints: { n: asFingerprint(CONTRACT_A), down: asFingerprint(CONTRACT_B) },
    inputs: { n: [asFingerprint("i1")], down: [] },
    renders: {
      n: [
        {
          status: "failed",
          reason: "boom",
          cost: RENDER_COST,
        },
      ],
    },
  });
  const r = createReconciler(h.ports, h.topo);
  const result = r.reconcile({ node: "n", wake: inputWake });
  equal(result.disposition, "failed");
  equal(result.receipt?.status, "failed");
  equal(result.propagated.length, 0, "a failure wakes no downstream");
  // Cold-start failure copies the reserved empty fingerprint forward.
  equal(result.receipt?.fingerprints[ATOMIC_FACET], COLD_START_ATOMIC_FINGERPRINT);
});

test("reconcile (failure path): a failure after a prior render copies the prior truth forward, does not propagate", () => {
  const chainTopology: TopologyWorldModel = {
    nodes: [],
    edges: [{ subscriber: asNodeId("down"), producer: asNodeId("n"), facet: ATOMIC_FACET }],
    entry_points: [],
    acyclic: true,
  };
  const h = harness({
    topology: chainTopology,
    contract_fingerprints: { n: asFingerprint(CONTRACT_A), down: asFingerprint(CONTRACT_B) },
    inputs: { n: [asFingerprint("i1")], down: [] },
    renders: {
      n: [
        // first render succeeds (cold start), establishing prior truth
        {
          status: "rendered",
          commit: {
            node: asNodeId("n"),
            version: ("sha256:" + "f".repeat(64)) as ContentAddress,
            fingerprints: atomic("good"),
          },
          semantic_diff: {},
          cost: RENDER_COST,
        },
        // second render fails
        { status: "failed", reason: "boom", cost: RENDER_COST },
      ],
    },
  });
  const r = createReconciler(h.ports, h.topo);
  const first = r.reconcile({ node: "n", wake: inputWake });
  equal(first.disposition, "rendered");
  h.setInputs("n", [asFingerprint("i2")]); // move inputs so the second wake renders (and fails)
  const second = r.reconcile({ node: "n", wake: inputWake });
  equal(second.disposition, "failed");
  equal(
    second.receipt?.fingerprints[ATOMIC_FACET],
    "good",
    "the prior truth stands after a failed render",
  );
  equal(second.propagated.length, 0);
});

// --------------------------------------------------------------------------
// drain — propagation through a 2-node chain (only moved fingerprint wakes)
// --------------------------------------------------------------------------

test("drain: a rendered+moved producer wakes its downstream; the downstream renders too", () => {
  const chainTopology: TopologyWorldModel = {
    nodes: [],
    edges: [{ subscriber: asNodeId("down"), producer: asNodeId("up"), facet: ATOMIC_FACET }],
    entry_points: [asNodeId("up")],
    acyclic: true,
  };
  const h = harness({
    topology: chainTopology,
    contract_fingerprints: { up: asFingerprint(CONTRACT_A), down: asFingerprint(CONTRACT_B) },
    inputs: { up: [], down: [asFingerprint("seed")] },
  });
  const r = createReconciler(h.ports, h.topo);
  const results = r.drain([{ node: "up", wake: externalWake }]);
  const ups = results.filter((x) => x.node === "up");
  const downs = results.filter((x) => x.node === "down");
  equal(ups.length, 1);
  equal(ups[0]?.disposition, "rendered");
  equal(downs.length, 1, "the moved producer woke the downstream exactly once");
  equal(downs[0]?.disposition, "rendered");
});

test("drain: a producer whose facet did not move (skip) wakes no downstream", () => {
  const chainTopology: TopologyWorldModel = {
    nodes: [],
    edges: [{ subscriber: asNodeId("down"), producer: asNodeId("up"), facet: ATOMIC_FACET }],
    entry_points: [asNodeId("up")],
    acyclic: true,
  };
  const h = harness({
    topology: chainTopology,
    contract_fingerprints: { up: asFingerprint(CONTRACT_A), down: asFingerprint(CONTRACT_B) },
    inputs: { up: [asFingerprint("fixed")], down: [asFingerprint("seed")] },
  });
  const r = createReconciler(h.ports, h.topo);
  // First drain: cold render of up wakes down.
  r.drain([{ node: "up", wake: externalWake }]);
  const before = h.renderCount();
  // Second wake to up with unmoved inputs ⇒ skip ⇒ no downstream wake.
  const results = r.drain([{ node: "up", wake: externalWake }]);
  equal(results[0]?.disposition, "skipped");
  equal(results.length, 1, "the skip queued no downstream wake");
  equal(h.renderCount(), before, "no further renders");
});

// --------------------------------------------------------------------------
// single-flight + coalescing
// --------------------------------------------------------------------------

test("single-flight: a wake arriving mid-render coalesces into one follow-up render", () => {
  const reentryTopology: TopologyWorldModel = {
    nodes: [],
    edges: [],
    entry_points: [asNodeId("n")],
    acyclic: true,
  };
  const ledger = new FakeLedger();
  let renderCount = 0;
  let reenteredOnce = false;
  let handle: ReturnType<typeof createReconciler>;

  const inputs: Record<string, InputFingerprints> = { n: [asFingerprint("i1")] };

  const ports: ReconcilerPorts = {
    ledger,
    worldModel: { publishedRef: (node) => fakeWorldModelRef(node) },
    resolveInputFingerprints: (node) => inputs[node] ?? [],
    spawnRender: (req) => {
      renderCount += 1;
      // While the FIRST render is in flight, deliver a mid-render wake. It must
      // NOT spawn a nested render; it marks the node dirty + coalesces.
      if (!reenteredOnce) {
        reenteredOnce = true;
        inputs.n = [asFingerprint("i2")]; // the mid-render wake reflects moved inputs
        const nested = handle.reconcile({ node: "n", wake: inputWake });
        equal(
          nested.disposition,
          "coalesced",
          "a mid-render wake coalesces, never spawns a nested render",
        );
      }
      return {
        status: "rendered",
        commit: {
          node: asNodeId(req.node),
          version: ("sha256:" + "d".repeat(64)) as ContentAddress,
          fingerprints: atomic(`r${renderCount}`),
        },
        semantic_diff: {},
        cost: RENDER_COST,
      } satisfies RenderOutcome;
    },
  };
  const topo: ReconcilerTopology = {
    topology: reentryTopology,
    contract_fingerprints: { n: asFingerprint(CONTRACT_A) },
  };
  handle = createReconciler(ports, topo);

  const result = handle.reconcile({ node: "n", wake: inputWake });
  equal(result.disposition, "rendered");
  // Exactly two renders: the original, then ONE coalesced follow-up (against the
  // freshly-moved i2). The mid-render wake did not spawn its own render.
  equal(renderCount, 2, "the coalesced follow-up is a single extra render");
});

test("single-flight: a coalesced follow-up whose inputs did not move skips (no redundant render)", () => {
  const topology: TopologyWorldModel = {
    nodes: [],
    edges: [],
    entry_points: [asNodeId("n")],
    acyclic: true,
  };
  const ledger = new FakeLedger();
  let renderCount = 0;
  let reenteredOnce = false;
  let handle: ReturnType<typeof createReconciler>;
  const inputs: Record<string, InputFingerprints> = { n: [asFingerprint("i1")] };

  const ports: ReconcilerPorts = {
    ledger,
    worldModel: { publishedRef: (node) => fakeWorldModelRef(node) },
    resolveInputFingerprints: (node) => inputs[node] ?? [],
    spawnRender: (req) => {
      renderCount += 1;
      if (!reenteredOnce) {
        reenteredOnce = true;
        // mid-render wake, but inputs DO NOT move ⇒ the follow-up must skip.
        const nested = handle.reconcile({ node: "n", wake: inputWake });
        equal(nested.disposition, "coalesced");
      }
      return {
        status: "rendered",
        commit: {
          node: asNodeId(req.node),
          version: ("sha256:" + "e".repeat(64)) as ContentAddress,
          fingerprints: atomic("stable"),
        },
        semantic_diff: {},
        cost: RENDER_COST,
      } satisfies RenderOutcome;
    },
  };
  const topo: ReconcilerTopology = {
    topology,
    contract_fingerprints: { n: asFingerprint(CONTRACT_A) },
  };
  handle = createReconciler(ports, topo);

  const result = handle.reconcile({ node: "n", wake: inputWake });
  // The follow-up re-keys; inputs unmoved ⇒ skip ⇒ no second render.
  equal(result.disposition, "skipped");
  equal(renderCount, 1, "coalescing never forces a redundant render");
});

// --------------------------------------------------------------------------
// missing topology entry is a hard error (no silent guessing)
// --------------------------------------------------------------------------

test("reconcile: a node missing from the compiled topology throws (Forme must run first)", () => {
  const h = harness({
    topology: singleNodeTopology,
    contract_fingerprints: {}, // no fingerprint for "n"
    inputs: { n: [] },
  });
  const r = createReconciler(h.ports, h.topo);
  let threw = false;
  try {
    r.reconcile({ node: "n", wake: inputWake });
  } catch {
    threw = true;
  }
  ok(threw, "an uncompiled node must error, not silently guess");
});

// --------------------------------------------------------------------------
// no judge: there is no model call on a skip
// --------------------------------------------------------------------------

// --------------------------------------------------------------------------
// THE HEADLINE EVAL — facet-granular propagation (the selector boundary),
// driven through the LIVE production resolver (`resolveInputs`, ledger-sourced —
// the resolver `mountDag` binds the reconciler port to). There is ONE run-half
// input-fingerprint resolver and this eval exercises it, not a parallel one.
//
// A 2-producer-facet node "vendor" exposes facets X and Y (plus the atomic
// whole-truth token), published into the LEDGER. "x_sub" Requires only vendor.X.
// The run half must:
//   - move facet Y (and the atomic token)  ⇒ x_sub SKIPS (its tuple held);
//   - move facet X                          ⇒ x_sub WAKES (its tuple moved);
//   - an atomic-only subscriber behaves byte-identically to the old path;
//   - the diamond still reconverges to ONE wake per distinct input tuple.
// (architecture.md §3.2 selector boundary; world-model.md §3; SHAPES §3.)
// --------------------------------------------------------------------------

// A sentinel contract fingerprint for a SYNTHETIC producer-publish receipt. It
// differs from the producer's compiled contract fingerprint so that seeding the
// producer's published truth does NOT memo-skip the producer's own next render
// (the memo key's contract half moves), while still feeding the ledger-sourced
// resolver the producer's `{facet → token}` map.
const SEED_CONTRACT = "sha256:" + "e".repeat(64);

/**
 * A synthetic `rendered` producer receipt carrying a published facet map — the
 * shape the LEDGER-SOURCED resolver reads (`resolveInputs` reads the producer's
 * last receipt `.fingerprints`). The eval moves a producer's published truth by
 * appending one of these, exactly as a real producer render would.
 */
function producerReceipt(node: string, fingerprints: FingerprintMap): Receipt {
  return {
    node: asNodeId(node),
    contract_fingerprint: asFingerprint(SEED_CONTRACT),
    wake: inputWake,
    input_fingerprints: [],
    fingerprints,
    semantic_diff: {},
    prev: null,
    status: "rendered",
    cost: RENDER_COST,
    sig: { scheme: "none", null_reason: "test" },
  };
}

/**
 * Reconciler wired with the LIVE, LEDGER-SOURCED resolver — the production path
 * (`resolveInputs` from `sdk/mounted-dag`, the resolver `mountDag` binds the
 * reconciler port to). Per inbound edge it reads the producer's last receipt
 * `.fingerprints` and resolves the subscribed facet, so moving a single facet
 * exercises the genuine run-half selector over the real ledger, not a hand-fed
 * tuple or a store-sourced parallel resolver. `setProducer` moves a producer's
 * published truth by appending a `rendered` receipt to the ledger (the producer
 * publishes its `{facet → token}` map there), so the selector boundary is proven
 * against the same code production runs.
 */
function facetHarness(input: {
  topology: TopologyWorldModel;
  contract_fingerprints: Record<string, Fingerprint>;
  producerFingerprints: Record<string, FingerprintMap>;
}): {
  reconciler: ReturnType<typeof createReconciler>;
  ledger: FakeLedger;
  renderCount: () => number;
  setProducer: (node: string, fps: FingerprintMap) => void;
  setRenderOutput: (node: string, fps: FingerprintMap) => void;
} {
  const ledger = new FakeLedger();
  // What each producer's own render commits (drives the diamond's vendor render).
  const table = { ...input.producerFingerprints };
  let renderCount = 0;
  let renderSeq = 0;

  // Seed each producer's published truth into the ledger so the ledger-sourced
  // resolver sees it on the first reconcile (a producer that has not rendered
  // exposes COLD_START via resolveInputs).
  for (const node of Object.keys(input.producerFingerprints)) {
    ledger.append(producerReceipt(node, input.producerFingerprints[node]!));
  }

  const ports: ReconcilerPorts = {
    ledger,
    worldModel: { publishedRef: (node) => fakeWorldModelRef(node) },
    // THE LIVE PRODUCTION RESOLVER: ledger-sourced, facet-granular.
    resolveInputFingerprints: (_node, edges) => resolveInputs(ledger, edges),
    spawnRender: (req) => {
      renderCount += 1;
      renderSeq += 1;
      // A subscriber's render publishes its own fresh atomic truth; a producer's
      // published facets are driven by the test via setProducer (its committed
      // map is what its receipt carries into the ledger).
      const existing = table[req.node];
      const commit: WorldModelCommit = {
        node: asNodeId(req.node),
        version: ("sha256:" +
          ("c".repeat(63) + String(renderSeq % 10))) as ContentAddress,
        fingerprints: existing ?? atomic(`r${renderSeq}`),
      };
      return { status: "rendered", commit, semantic_diff: {}, cost: RENDER_COST };
    },
  };
  const topo: ReconcilerTopology = {
    topology: input.topology,
    contract_fingerprints: input.contract_fingerprints,
  };
  return {
    reconciler: createReconciler(ports, topo),
    ledger,
    renderCount: () => renderCount,
    setProducer: (node, fps) => {
      table[node] = fps;
      // Move the producer's PUBLISHED truth in the ledger — what the live
      // ledger-sourced resolver reads on the subscriber's next reconcile.
      ledger.append(producerReceipt(node, fps));
    },
    // Set ONLY what the producer's own render commits — no synthetic ledger
    // append. Used when the producer publishes its move through its OWN render
    // (the live propagation path: commit-vs-prior-receipt drives propagation).
    setRenderOutput: (node, fps) => {
      table[node] = fps;
    },
  };
}

const FACETED_TOPOLOGY: TopologyWorldModel = {
  nodes: [
    { node: asNodeId("vendor"), contract_fingerprint: asFingerprint(CONTRACT_A), wake_source: "input" },
    { node: asNodeId("x_sub"), contract_fingerprint: asFingerprint(CONTRACT_B), wake_source: "input" },
  ],
  edges: [{ subscriber: asNodeId("x_sub"), producer: asNodeId("vendor"), facet: asFacet("X") }],
  entry_points: [asNodeId("vendor")],
  acyclic: true,
};

test("facet eval: move facet Y (X held) ⇒ the X-subscriber SKIPS", () => {
  const h = facetHarness({
    topology: FACETED_TOPOLOGY,
    contract_fingerprints: { vendor: asFingerprint(CONTRACT_A), x_sub: asFingerprint(CONTRACT_B) },
    producerFingerprints: {
      vendor: { [ATOMIC_FACET]: asFingerprint("fp:whole-1"), X: asFingerprint("fp:x-1"), Y: asFingerprint("fp:y-1") },
    },
  });
  // Cold render of x_sub establishes its last receipt (tuple = [fp:x-1]).
  const cold = h.reconciler.reconcile({ node: "x_sub", wake: inputWake });
  equal(cold.disposition, "rendered");
  // Move ONLY facet Y (the atomic whole-token moves too; X holds).
  h.setProducer("vendor", { [ATOMIC_FACET]: asFingerprint("fp:whole-2"), X: asFingerprint("fp:x-1"), Y: asFingerprint("fp:y-2") });
  const after = h.reconciler.reconcile({ node: "x_sub", wake: inputWake });
  equal(after.disposition, "skipped", "Y moving must NOT wake an X-subscriber");
  equal(h.renderCount(), 1, "no second render — the selector boundary held");
});

test("facet eval: move facet X ⇒ the X-subscriber WAKES", () => {
  const h = facetHarness({
    topology: FACETED_TOPOLOGY,
    contract_fingerprints: { vendor: asFingerprint(CONTRACT_A), x_sub: asFingerprint(CONTRACT_B) },
    producerFingerprints: {
      vendor: { [ATOMIC_FACET]: asFingerprint("fp:whole-1"), X: asFingerprint("fp:x-1"), Y: asFingerprint("fp:y-1") },
    },
  });
  h.reconciler.reconcile({ node: "x_sub", wake: inputWake }); // cold render
  // Move facet X (Y holds).
  h.setProducer("vendor", { [ATOMIC_FACET]: asFingerprint("fp:whole-2"), X: asFingerprint("fp:x-2"), Y: asFingerprint("fp:y-1") });
  const after = h.reconciler.reconcile({ node: "x_sub", wake: inputWake });
  equal(after.disposition, "rendered", "X moving must wake the X-subscriber");
  equal(h.renderCount(), 2);
});

test("facet eval: an atomic-only subscriber wakes on ANY producer change (unchanged behavior)", () => {
  const atomicTopology: TopologyWorldModel = {
    nodes: [],
    edges: [{ subscriber: asNodeId("a_sub"), producer: asNodeId("vendor"), facet: ATOMIC_FACET }],
    entry_points: [asNodeId("vendor")],
    acyclic: true,
  };
  const h = facetHarness({
    topology: atomicTopology,
    contract_fingerprints: { vendor: asFingerprint(CONTRACT_A), a_sub: asFingerprint(CONTRACT_B) },
    producerFingerprints: {
      vendor: { [ATOMIC_FACET]: asFingerprint("fp:whole-1"), X: asFingerprint("fp:x-1"), Y: asFingerprint("fp:y-1") },
    },
  });
  h.reconciler.reconcile({ node: "a_sub", wake: inputWake }); // cold render
  // Move ONLY facet Y; the atomic whole-token moves, so the atomic-only sub wakes.
  h.setProducer("vendor", { [ATOMIC_FACET]: asFingerprint("fp:whole-2"), X: asFingerprint("fp:x-1"), Y: asFingerprint("fp:y-2") });
  const after = h.reconciler.reconcile({ node: "a_sub", wake: inputWake });
  equal(
    after.disposition,
    "rendered",
    "an atomic-only subscriber wakes on any whole-truth move",
  );
});

test("facet eval (diamond): a subscriber reachable by two moved facets of one producer wakes ONCE", () => {
  // x_sub subscribes to BOTH vendor.X and vendor.Y — the diamond. When the
  // producer renders and both facets move, the subscriber is woken exactly once
  // per distinct input-fingerprint tuple (world-model.md §3 "renders once per
  // distinct input-fingerprint tuple, not once per inbound edge").
  const diamond: TopologyWorldModel = {
    nodes: [],
    edges: [
      { subscriber: asNodeId("x_sub"), producer: asNodeId("vendor"), facet: asFacet("X") },
      { subscriber: asNodeId("x_sub"), producer: asNodeId("vendor"), facet: asFacet("Y") },
    ],
    entry_points: [asNodeId("vendor")],
    acyclic: true,
  };
  const h = facetHarness({
    topology: diamond,
    contract_fingerprints: { vendor: asFingerprint(CONTRACT_A), x_sub: asFingerprint(CONTRACT_B) },
    producerFingerprints: {
      vendor: { [ATOMIC_FACET]: asFingerprint("fp:whole-1"), X: asFingerprint("fp:x-1"), Y: asFingerprint("fp:y-1") },
    },
  });
  // Seed x_sub's last receipt against the producer's published truth.
  h.reconciler.reconcile({ node: "x_sub", wake: inputWake });
  const before = h.renderCount();
  // Vendor publishes its move through its OWN render (the live propagation path:
  // its commit {X-2,Y-2} vs its prior receipt {X-1,Y-1} moves BOTH facets). Both
  // inbound edges resolve to x_sub, which must wake exactly once.
  h.setRenderOutput("vendor", { [ATOMIC_FACET]: asFingerprint("fp:whole-2"), X: asFingerprint("fp:x-2"), Y: asFingerprint("fp:y-2") });
  const results = h.reconciler.drain([{ node: "vendor", wake: externalWake }]);
  const xWakes = results.filter((r) => r.node === "x_sub");
  equal(xWakes.length, 1, "the diamond reconverges to ONE wake, not one per edge");
  equal(xWakes[0]?.disposition, "rendered");
  equal(h.renderCount(), before + 2, "one vendor render + one single x_sub render");
});

// ==========================================================================
// MK-1 — the height-ordered, dirty-count-gated drain + the staggered
// (unequal-path) diamond regression.
//
// The stock FIFO drain renders a recombinant join with UNEQUAL path lengths
// TWICE: once prematurely against a half-propagated input set (a GLITCH — the
// short edge moved, the long path is still stale), then again once the long
// path settles (a REDUNDANT render). "Cost scales with surprise" (Invariant 5)
// visibly fails for that topology. The height-ordered drain fires each node
// once, in ascending height, only after all its dirty producers have settled —
// so the join renders EXACTLY ONCE against fully-settled inputs.
//
// These tests drive the REAL `reconciler.drain` over an independent A→B→C→E
// chain (the existing `harness` hand-feeds tuples; `facetHarness` is
// single-producer — neither models a multi-hop chain), porting the C1 live-repro
// mechanism: each node reads its upstreams' CURRENT published fingerprints from a
// mutable table and moves its own fingerprint iff its inputs moved.
// ==========================================================================

/** Cheap dependency-respecting (Kahn) order for cold-starting a chain. */
function topoOrder(
  nodeIds: readonly string[],
  edges: readonly { producer: string; subscriber: string }[],
): string[] {
  const indeg: Record<string, number> = {};
  const out: Record<string, string[]> = {};
  for (const n of nodeIds) {
    indeg[n] = 0;
    out[n] = [];
  }
  for (const e of edges) {
    indeg[e.subscriber] = (indeg[e.subscriber] ?? 0) + 1;
    (out[e.producer] ??= []).push(e.subscriber);
  }
  const q = nodeIds.filter((n) => (indeg[n] ?? 0) === 0);
  const order: string[] = [];
  while (q.length > 0) {
    const n = q.shift() as string;
    order.push(n);
    for (const m of out[n] ?? []) {
      indeg[m] = (indeg[m] ?? 0) - 1;
      if (indeg[m] === 0) q.push(m);
    }
  }
  return order;
}

interface ChainRender {
  node: string;
  inputs: { producer: string; fp: string }[];
  moved: boolean;
}

/**
 * A chain-capable, table-sourced harness (port of `c1-diamond-glitch`): each
 * node reads its inbound producers' CURRENT published fingerprints and, on
 * render, moves its own published fingerprint iff its input tuple moved since it
 * last rendered. Drives the REAL `reconciler.drain`/`drainAsync`. `stableNodes`
 * render but never move their published truth (so they settle their downstreams
 * WITHOUT propagating — the prune path).
 */
function chainHarness(
  edges: readonly { producer: string; subscriber: string }[],
  opts?: { stableNodes?: readonly string[] },
): {
  reconciler: ReturnType<typeof createReconciler>;
  nodeIds: string[];
  renderCounts: Record<string, number>;
  renderLog: ChainRender[];
  ledger: FakeLedger;
  preWake: Record<string, string>;
  resetBookkeeping: () => void;
  bumpInput: () => void;
} {
  const stable = new Set(opts?.stableNodes ?? []);
  const nodeIds = [...new Set(edges.flatMap((e) => [e.producer, e.subscriber]))];
  const ledger = new FakeLedger();
  const published: Record<string, string> = {};
  for (const n of nodeIds) published[n] = "seed:" + n;
  let extInput = "ext:0";
  const lastRenderedInputs: Record<string, string> = {};
  const renderCounts: Record<string, number> = {};
  for (const n of nodeIds) renderCounts[n] = 0;
  const renderLog: ChainRender[] = [];
  let renderSeq = 0;

  const topology: TopologyWorldModel = {
    nodes: nodeIds.map((n) => ({
      node: asNodeId(n),
      contract_fingerprint: asFingerprint(CONTRACT_A),
      wake_source: "input",
    })),
    edges: edges.map((e) => ({
      subscriber: asNodeId(e.subscriber),
      producer: asNodeId(e.producer),
      facet: ATOMIC_FACET,
    })),
    entry_points: [asNodeId("A")],
    acyclic: true,
  };

  const ports: ReconcilerPorts = {
    ledger,
    worldModel: { publishedRef: (node) => fakeWorldModelRef(node) },
    resolveInputFingerprints: (node, inEdges) =>
      node === "A"
        ? [asFingerprint(extInput)]
        : inEdges.map((e) =>
            asFingerprint(published[String(e.producer)] ?? "seed:" + String(e.producer)),
          ),
    spawnRender: (req) => {
      const node = req.node;
      renderCounts[node] = (renderCounts[node] ?? 0) + 1;
      renderSeq += 1;
      const seenInputs = req.input_fingerprints.map(String);
      const inbound = req.inbound_edges.map((e) => String(e.producer));
      const seen = inbound.map((p, i) => ({ producer: p, fp: seenInputs[i] ?? "" }));
      const prevKey = lastRenderedInputs[node];
      const nowKey = JSON.stringify(seenInputs);
      const moved = prevKey === undefined || prevKey !== nowKey;
      lastRenderedInputs[node] = nowKey;
      renderLog.push({ node, inputs: seen, moved });
      if (moved && !stable.has(node)) {
        published[node] = "v" + renderSeq + ":" + node;
      }
      const commit: WorldModelCommit = {
        node: asNodeId(node),
        version: ("sha256:" +
          ("c".repeat(63) + String(renderSeq % 10))) as ContentAddress,
        fingerprints: atomic(published[node] ?? "seed:" + node),
      };
      return { status: "rendered", commit, semantic_diff: {}, cost: RENDER_COST };
    },
  };

  const reconciler = createReconciler(ports, {
    topology,
    contract_fingerprints: Object.fromEntries(
      nodeIds.map((n) => [n, asFingerprint(CONTRACT_A)]),
    ),
  });

  // Cold-start every node to a committed baseline in dependency order.
  for (const n of topoOrder(nodeIds, edges)) {
    reconciler.reconcile({ node: n, wake: inputWake });
  }
  const preWake: Record<string, string> = { ...published };

  return {
    reconciler,
    nodeIds,
    renderCounts,
    renderLog,
    ledger,
    preWake,
    resetBookkeeping: () => {
      for (const n of nodeIds) renderCounts[n] = 0;
      renderLog.length = 0;
    },
    bumpInput: () => {
      extInput = "ext:1";
    },
  };
}

const STAGGERED_DIAMOND = [
  { producer: "A", subscriber: "B" },
  { producer: "B", subscriber: "C" },
  { producer: "A", subscriber: "E" }, // short edge (1 hop)
  { producer: "C", subscriber: "E" }, // long path tail (3 hops)
];

const SYMMETRIC_DIAMOND = [
  { producer: "A", subscriber: "B" },
  { producer: "A", subscriber: "C" },
  { producer: "B", subscriber: "E" },
  { producer: "C", subscriber: "E" },
];

/** Did any E render fire against A-moved-but-C-still-pre-wake (the glitch)? */
function eGlitched(log: ChainRender[], cPreWake: string): boolean {
  for (const er of log.filter((x) => x.node === "E")) {
    const aIn = er.inputs.find((i) => i.producer === "A");
    const cIn = er.inputs.find((i) => i.producer === "C");
    if (!aIn || !cIn) continue;
    if (aIn.fp !== "seed:A" && cIn.fp === cPreWake) return true;
  }
  return false;
}

// --- U1: computeHeights ----------------------------------------------------

test("computeHeights: staggered diamond → A:0,B:1,C:2,E:3 (unequal path lengths)", () => {
  deepEqual(computeHeights(["A", "B", "C", "E"], STAGGERED_DIAMOND), {
    A: 0,
    B: 1,
    C: 2,
    E: 3,
  });
});

test("computeHeights: symmetric diamond → A:0,B:1,C:1,E:2 (equal path lengths)", () => {
  deepEqual(computeHeights(["A", "B", "C", "E"], SYMMETRIC_DIAMOND), {
    A: 0,
    B: 1,
    C: 1,
    E: 2,
  });
});

test("computeHeights: a forged cyclic topology throws (acyclicity is load-bearing)", () => {
  let threw = false;
  try {
    computeHeights(
      ["X", "Y"],
      [
        { producer: "X", subscriber: "Y" },
        { producer: "Y", subscriber: "X" },
      ],
    );
  } catch {
    threw = true;
  }
  ok(threw, "a cycle must throw, not loop forever or return a bogus height");
});

// --- U0 (the primary) + U6 -------------------------------------------------

test("drain (MK-1 PRIMARY): staggered unequal-path diamond — the join renders ONCE against settled inputs", () => {
  const h = chainHarness(STAGGERED_DIAMOND);
  const cPreWake = h.preWake["C"] as string;
  h.resetBookkeeping();
  h.bumpInput();
  const results = h.reconciler.drain([{ node: "A", wake: externalWake }]);

  equal(h.renderCounts["E"], 1, "E renders exactly once (stock FIFO renders it twice)");
  equal(
    eGlitched(h.renderLog, cPreWake),
    false,
    "no E render fired against A-moved-but-C-stale (no glitch)",
  );
  // The single E render saw the SETTLED C (moved off its pre-wake fingerprint).
  const eRender = h.renderLog.find((x) => x.node === "E");
  const cInput = eRender?.inputs.find((i) => i.producer === "C");
  ok(cInput && cInput.fp !== cPreWake, "E saw the settled (post-wave) C fingerprint");
  equal(h.renderCounts["A"], 1);
  equal(h.renderCounts["B"], 1);
  equal(h.renderCounts["C"], 1);
  // Every node fired and the drain returned one result per fired node.
  equal(results.filter((r) => r.disposition === "rendered").length, 4);
});

test("drain (MK-1 control): symmetric equal-path diamond — the join also renders once (the trigger is UNEQUAL length, not the shape)", () => {
  const h = chainHarness(SYMMETRIC_DIAMOND);
  h.resetBookkeeping();
  h.bumpInput();
  h.reconciler.drain([{ node: "A", wake: externalWake }]);
  equal(h.renderCounts["E"], 1, "the symmetric control never glitched and still renders E once");
  equal(h.renderCounts["A"], 1);
  equal(h.renderCounts["B"], 1);
  equal(h.renderCounts["C"], 1);
});

test("drain (MK-1): a no-change re-drain renders ZERO nodes and mints exactly one (seed) skip — the move-aware prune", () => {
  const h = chainHarness(STAGGERED_DIAMOND);
  // First, a real wave to settle everything.
  h.bumpInput();
  h.reconciler.drain([{ node: "A", wake: externalWake }]);
  // Re-drain with NO input change: A skips, its whole downstream closure prunes.
  h.resetBookkeeping();
  const results = h.reconciler.drain([{ node: "A", wake: externalWake }]);
  equal(
    Object.values(h.renderCounts).reduce((a, b) => a + b, 0),
    0,
    "a no-change re-drain renders nothing (cost scales with surprise)",
  );
  equal(results.length, 1, "only the seed produced a receipt; the closure was pruned");
  equal(results[0]?.node, "A");
  equal(results[0]?.disposition, "skipped");
});

test("drain (MK-1): two seeds on one chain — the interior seed waits for its dirty upstream (no glitch)", () => {
  // A→B→C; wake BOTH A and C. C is a directly-woken seed AND downstream of A→B.
  // Without the interior-seed gate, C fires on its own wake against a pre-wake B,
  // then again once B settles. The gate makes C wait until B settles ⇒ C renders
  // once, against the moved B.
  const h = chainHarness([
    { producer: "A", subscriber: "B" },
    { producer: "B", subscriber: "C" },
  ]);
  const bPreWake = h.preWake["B"] as string;
  h.resetBookkeeping();
  h.bumpInput();
  h.reconciler.drain([
    { node: "A", wake: externalWake },
    { node: "C", wake: externalWake },
  ]);
  equal(h.renderCounts["C"], 1, "the interior seed fired exactly once (gate held)");
  const cRender = h.renderLog.find((x) => x.node === "C");
  const bInput = cRender?.inputs.find((i) => i.producer === "B");
  ok(bInput && bInput.fp !== bPreWake, "C saw the settled (moved) B, not the pre-wake B");
});

test("drain (MK-1): a pruned interior node still settles a deeper join — no prune-deadlock", () => {
  // Staggered diamond with B STABLE: A moves and wakes both E (short) and B
  // (long). B renders but does NOT move its truth ⇒ C is settled-without-moved
  // ⇒ C is PRUNED (no render). C must STILL settle E, or the depth-3 join
  // deadlocks. E fires once (woken by A's short edge) against the unchanged C.
  const h = chainHarness(STAGGERED_DIAMOND, { stableNodes: ["B"] });
  h.resetBookkeeping();
  h.bumpInput();
  h.reconciler.drain([{ node: "A", wake: externalWake }]); // must not throw (no deadlock)
  equal(h.renderCounts["C"], 0, "C was pruned (its only producer B settled without moving)");
  equal(h.renderCounts["E"], 1, "the depth-3 join still fired exactly once — C settled it");
  equal(h.renderCounts["A"], 1);
});

test("no judge: a skip never invokes the render (the harness never asks an LLM 'did this change')", () => {
  let rendered = 0;
  const h = harness({
    topology: singleNodeTopology,
    contract_fingerprints: { n: asFingerprint(CONTRACT_A) },
    inputs: { n: [asFingerprint("i1")] },
    onRender: () => {
      rendered += 1;
    },
  });
  const r = createReconciler(h.ports, h.topo);
  r.reconcile({ node: "n", wake: inputWake }); // cold render
  r.reconcile({ node: "n", wake: inputWake }); // skip
  r.reconcile({ node: "n", wake: inputWake }); // skip
  equal(rendered, 1, "two skips invoked zero renders — pure fingerprint compare");
});
