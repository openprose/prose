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
  type WorldModelRef,
} from "../../shapes";
import {
  type ReconcilerPorts,
  type ReconcilerTopology,
  type RenderOutcome,
  type RenderRequest,
  type WakeEvent,
  COLD_START_ATOMIC_FINGERPRINT,
  createReconciler,
  inboundEdges,
  memoKeyMoved,
  movedFacetsBetween,
  propagationTargets,
} from "../index";

// --------------------------------------------------------------------------
// Fakes
// --------------------------------------------------------------------------

const CONTRACT_A = "sha256:" + "a".repeat(64);
const CONTRACT_B = "sha256:" + "b".repeat(64);

function atomic(token: string): FingerprintMap {
  return { [ATOMIC_FACET]: token };
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
    node,
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
        node: req.node,
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
  contract_fingerprint: Fingerprint,
  input_fingerprints: InputFingerprints,
): Receipt {
  return {
    node: "n",
    contract_fingerprint,
    wake: inputWake,
    input_fingerprints,
    fingerprints: atomic("x"),
    semantic_diff: {},
    prev: null,
    status: "rendered",
    cost: RENDER_COST,
    sig: { scheme: "none", null_reason: "test" },
  };
}

test("memoKeyMoved: unchanged contract + inputs ⇒ not moved (skip)", () => {
  const last = receiptWith(CONTRACT_A, ["i1", "i2"]);
  equal(
    memoKeyMoved(last, {
      contract_fingerprint: CONTRACT_A,
      input_fingerprints: ["i1", "i2"],
    }),
    false,
  );
});

test("memoKeyMoved: a moved input fingerprint ⇒ moved (render)", () => {
  const last = receiptWith(CONTRACT_A, ["i1", "i2"]);
  equal(
    memoKeyMoved(last, {
      contract_fingerprint: CONTRACT_A,
      input_fingerprints: ["i1", "i2-PRIME"],
    }),
    true,
  );
});

test("memoKeyMoved: a moved contract fingerprint ⇒ moved (schema migration = forced render)", () => {
  const last = receiptWith(CONTRACT_A, ["i1"]);
  equal(
    memoKeyMoved(last, {
      contract_fingerprint: CONTRACT_B,
      input_fingerprints: ["i1"],
    }),
    true,
  );
});

test("memoKeyMoved: input arity change ⇒ moved", () => {
  const last = receiptWith(CONTRACT_A, ["i1"]);
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
  const moved = movedFacetsBetween(null, { [ATOMIC_FACET]: "v1", price: "p1" });
  ok(moved.has(ATOMIC_FACET));
  ok(moved.has("price"));
  equal(moved.size, 2);
});

test("movedFacetsBetween: unchanged facets are not moved", () => {
  const moved = movedFacetsBetween(
    { [ATOMIC_FACET]: "v1", price: "p1" },
    { [ATOMIC_FACET]: "v2", price: "p1" },
  );
  ok(moved.has(ATOMIC_FACET));
  ok(!moved.has("price"));
  equal(moved.size, 1);
});

// --------------------------------------------------------------------------
// propagationTargets — wake downstreams subscribed to a moved facet
// --------------------------------------------------------------------------

test("propagationTargets: only subscribers of a moved facet are woken, once each", () => {
  const topology: TopologyWorldModel = {
    nodes: [],
    edges: [
      { subscriber: "down1", producer: "up", facet: ATOMIC_FACET },
      { subscriber: "down2", producer: "up", facet: "price" },
      { subscriber: "down1", producer: "up", facet: "price" },
      { subscriber: "other", producer: "elsewhere", facet: ATOMIC_FACET },
    ],
    entry_points: [],
    acyclic: true,
  };
  const targets = propagationTargets({
    topology,
    producer: "up",
    movedFacets: new Set([ATOMIC_FACET, "price"]),
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
    edges: [{ subscriber: "down", producer: "up", facet: "price" }],
    entry_points: [],
    acyclic: true,
  };
  const targets = propagationTargets({
    topology,
    producer: "up",
    movedFacets: new Set(["unsubscribed"]),
    wakeRef: ("sha256:" + "9".repeat(64)) as ContentAddress,
  });
  equal(targets.length, 0);
});

test("inboundEdges: returns only edges where the node is the subscriber", () => {
  const topology: TopologyWorldModel = {
    nodes: [],
    edges: [
      { subscriber: "n", producer: "a", facet: ATOMIC_FACET },
      { subscriber: "n", producer: "b", facet: ATOMIC_FACET },
      { subscriber: "m", producer: "a", facet: ATOMIC_FACET },
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
  nodes: [{ node: "n", contract_fingerprint: CONTRACT_A, wake_source: "input" }],
  edges: [],
  entry_points: [],
  acyclic: true,
};

test("reconcile: cold start (no prior receipt) always renders", () => {
  const h = harness({
    topology: singleNodeTopology,
    contract_fingerprints: { n: CONTRACT_A },
    inputs: { n: ["i1"] },
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
    contract_fingerprints: { n: CONTRACT_A },
    inputs: { n: ["i1"] },
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
    contract_fingerprints: { n: CONTRACT_A },
    inputs: { n: ["i1"] },
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
    contract_fingerprints: { n: CONTRACT_A },
    inputs: { n: ["i1"] },
  });
  const r = createReconciler(h.ports, h.topo);
  r.reconcile({ node: "n", wake: inputWake }); // cold render
  h.setInputs("n", ["i2"]); // upstream moved
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
    edges: [{ subscriber: "down", producer: "n", facet: ATOMIC_FACET }],
    entry_points: [],
    acyclic: true,
  };
  const h = harness({
    topology: diamondTopology,
    contract_fingerprints: { n: CONTRACT_A, down: CONTRACT_B },
    inputs: { n: ["i1"], down: [] },
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
    edges: [{ subscriber: "down", producer: "n", facet: ATOMIC_FACET }],
    entry_points: [],
    acyclic: true,
  };
  const h = harness({
    topology: chainTopology,
    contract_fingerprints: { n: CONTRACT_A, down: CONTRACT_B },
    inputs: { n: ["i1"], down: [] },
    renders: {
      n: [
        // first render succeeds (cold start), establishing prior truth
        {
          status: "rendered",
          commit: {
            node: "n",
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
  h.setInputs("n", ["i2"]); // move inputs so the second wake renders (and fails)
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
    edges: [{ subscriber: "down", producer: "up", facet: ATOMIC_FACET }],
    entry_points: ["up"],
    acyclic: true,
  };
  const h = harness({
    topology: chainTopology,
    contract_fingerprints: { up: CONTRACT_A, down: CONTRACT_B },
    inputs: { up: [], down: ["seed"] },
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
    edges: [{ subscriber: "down", producer: "up", facet: ATOMIC_FACET }],
    entry_points: ["up"],
    acyclic: true,
  };
  const h = harness({
    topology: chainTopology,
    contract_fingerprints: { up: CONTRACT_A, down: CONTRACT_B },
    inputs: { up: ["fixed"], down: ["seed"] },
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
    entry_points: ["n"],
    acyclic: true,
  };
  const ledger = new FakeLedger();
  let renderCount = 0;
  let reenteredOnce = false;
  let handle: ReturnType<typeof createReconciler>;

  const inputs: Record<string, InputFingerprints> = { n: ["i1"] };

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
        inputs.n = ["i2"]; // the mid-render wake reflects moved inputs
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
          node: req.node,
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
    contract_fingerprints: { n: CONTRACT_A },
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
    entry_points: ["n"],
    acyclic: true,
  };
  const ledger = new FakeLedger();
  let renderCount = 0;
  let reenteredOnce = false;
  let handle: ReturnType<typeof createReconciler>;
  const inputs: Record<string, InputFingerprints> = { n: ["i1"] };

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
          node: req.node,
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
    contract_fingerprints: { n: CONTRACT_A },
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

test("no judge: a skip never invokes the render (the harness never asks an LLM 'did this change')", () => {
  let rendered = 0;
  const h = harness({
    topology: singleNodeTopology,
    contract_fingerprints: { n: CONTRACT_A },
    inputs: { n: ["i1"] },
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
