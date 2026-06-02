// Tests for the ASYNC reconcile path (Phase-1 live execution).
//
// These prove the additive `reconcileAsync`/`drainAsync` path (05 §1.1–§1.2)
// AND the single mandatory invariant the async transition makes reachable
// (05 §1.3, the crux): a wake delivered while a node's render is IN FLIGHT
// (awaited, suspended) must produce exactly ONE coalesced follow-up render
// against the FRESHEST inputs — never a second concurrent render, never a lost
// wake. Under the SYNC path this machinery was effectively dead code (a sync
// render never yields, so a second reconcile cannot run during it). The async
// path releases the single-flight lock across the await, so a concurrently
// delivered wake genuinely hits the (A) coalesce guard.
//
// Run: built into dist by `pnpm build`, executed by `node --test`.

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
  type TopologyWorldModel,
  type Wake,
  type WorldModelCommit,
  type WorldModelRef, asFingerprint, asNodeId} from "../../shapes";
import {
  type ReconcilerPorts,
  type ReconcilerTopology,
  type RenderOutcome,
  type RenderRequest,
  createReconciler,
} from "../index";

// --------------------------------------------------------------------------
// Fakes (mirrors reconciler.test.ts; kept local so the two suites are
// independent and the async crux is legible in one file).
// --------------------------------------------------------------------------

const CONTRACT_A = "sha256:" + "a".repeat(64);

function atomic(token: string): FingerprintMap {
  return { [ATOMIC_FACET]: asFingerprint(token) };
}

const RENDER_COST: Cost = {
  provider: "test",
  model: "test-model",
  tokens: { fresh: 100, reused: 0 },
  surprise_cause: "input",
};

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

const inputWake: Wake = { source: "input", refs: [] };

const singleNodeTopology: TopologyWorldModel = {
  nodes: [],
  edges: [],
  entry_points: [asNodeId("n")],
  acyclic: true,
};

/** A manually-resolvable promise — the "render in flight" suspension handle. */
function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function renderedOutcome(node: string, token: string): RenderOutcome {
  const commit: WorldModelCommit = {
    node: asNodeId(node),
    version: ("sha256:" + "d".repeat(64)) as ContentAddress,
    fingerprints: atomic(token),
  };
  return { status: "rendered", commit, semantic_diff: {}, cost: RENDER_COST };
}

// --------------------------------------------------------------------------
// drainAsync — the serialized async fixpoint (05 §1.2)
// --------------------------------------------------------------------------

test("drainAsync: cold start renders and returns the per-node result", async () => {
  const ledger = new FakeLedger();
  const inputs: Record<string, InputFingerprints> = { n: [asFingerprint("i1")] };
  let renderCount = 0;
  const ports: ReconcilerPorts = {
    ledger,
    worldModel: { publishedRef: (node) => fakeWorldModelRef(node) },
    resolveInputFingerprints: (node) => inputs[node] ?? [],
    spawnRender: () => {
      throw new Error("sync spawnRender must not be used on the async path");
    },
    spawnRenderAsync: async (req: RenderRequest) => {
      renderCount += 1;
      return renderedOutcome(req.node, `v${renderCount}`);
    },
  };
  const topo: ReconcilerTopology = {
    topology: singleNodeTopology,
    contract_fingerprints: { n: asFingerprint(CONTRACT_A) },
  };
  const handle = createReconciler(ports, topo);

  const results = await handle.drainAsync([{ node: "n", wake: inputWake }]);
  equal(results.length, 1);
  equal(results[0]?.disposition, "rendered");
  equal(renderCount, 1);
});

test("drainAsync: unmoved inputs ⇒ skip, no async render spawned", async () => {
  const ledger = new FakeLedger();
  const inputs: Record<string, InputFingerprints> = { n: [asFingerprint("i1")] };
  let renderCount = 0;
  const ports: ReconcilerPorts = {
    ledger,
    worldModel: { publishedRef: (node) => fakeWorldModelRef(node) },
    resolveInputFingerprints: (node) => inputs[node] ?? [],
    spawnRender: () => {
      throw new Error("unused");
    },
    spawnRenderAsync: async (req: RenderRequest) => {
      renderCount += 1;
      return renderedOutcome(req.node, "stable");
    },
  };
  const topo: ReconcilerTopology = {
    topology: singleNodeTopology,
    contract_fingerprints: { n: asFingerprint(CONTRACT_A) },
  };
  const handle = createReconciler(ports, topo);

  await handle.drainAsync([{ node: "n", wake: inputWake }]); // cold render
  const second = await handle.drainAsync([{ node: "n", wake: inputWake }]);
  equal(second[0]?.disposition, "skipped", "inputs unmoved ⇒ memo skip");
  equal(renderCount, 1, "no second render on an unmoved memo key");
});

test("drainAsync: an async render that falls back to the sync mount still commits", async () => {
  // When spawnRenderAsync is absent, renderAndCommitAsync wraps the sync
  // spawnRender (a sync render is an already-resolved promise) — additive
  // subsumption (05 §5 Phase A).
  const ledger = new FakeLedger();
  const inputs: Record<string, InputFingerprints> = { n: [asFingerprint("i1")] };
  let renderCount = 0;
  const ports: ReconcilerPorts = {
    ledger,
    worldModel: { publishedRef: (node) => fakeWorldModelRef(node) },
    resolveInputFingerprints: (node) => inputs[node] ?? [],
    spawnRender: (req: RenderRequest) => {
      renderCount += 1;
      return renderedOutcome(req.node, "v1");
    },
    // no spawnRenderAsync
  };
  const topo: ReconcilerTopology = {
    topology: singleNodeTopology,
    contract_fingerprints: { n: asFingerprint(CONTRACT_A) },
  };
  const handle = createReconciler(ports, topo);

  const results = await handle.drainAsync([{ node: "n", wake: inputWake }]);
  equal(results[0]?.disposition, "rendered");
  equal(renderCount, 1, "the sync spawn is reached through the async path");
});

// --------------------------------------------------------------------------
// THE MANDATORY CRUX — coalescing under await (05 §1.3)
// --------------------------------------------------------------------------

test("coalescing-under-await: a wake arriving DURING an in-flight awaited render produces exactly ONE coalesced follow-up against the freshest inputs", async () => {
  const ledger = new FakeLedger();
  const inputs: Record<string, InputFingerprints> = { n: [asFingerprint("i1")] };

  // The first render's suspension handle: it stays pending until we resolve it,
  // so the single-flight lock is genuinely held across the await while a second
  // wake is delivered.
  const firstRenderGate = deferred<void>();
  let renderCount = 0;
  const renderedTokens: string[] = [];
  const renderedInputs: InputFingerprints[] = [];

  let handle: ReturnType<typeof createReconciler>;

  const ports: ReconcilerPorts = {
    ledger,
    worldModel: { publishedRef: (node) => fakeWorldModelRef(node) },
    resolveInputFingerprints: (node) => inputs[node] ?? [],
    spawnRender: () => {
      throw new Error("sync spawnRender must not be used on the async path");
    },
    spawnRenderAsync: async (req: RenderRequest) => {
      renderCount += 1;
      // Record the inputs THIS render was keyed against (proves the follow-up
      // renders against the freshest inputs, not the stale original).
      renderedInputs.push([...req.input_fingerprints]);
      if (renderCount === 1) {
        // FIRST render in flight: suspend here until the gate opens, so the
        // single-flight lock is held across a real await.
        await firstRenderGate.promise;
      }
      const token = `r${renderCount}`;
      renderedTokens.push(token);
      return renderedOutcome(req.node, token);
    },
  };
  const topo: ReconcilerTopology = {
    topology: singleNodeTopology,
    contract_fingerprints: { n: asFingerprint(CONTRACT_A) },
  };
  handle = createReconciler(ports, topo);

  // (1) Start the first render but DO NOT await it — it suspends in the gate
  // with the single-flight lock held.
  const firstPromise = handle.reconcileAsync({ node: "n", wake: inputWake });

  // Let the microtask queue advance so the first reconcile reaches the awaited
  // render and parks on the gate (lock now held).
  await Promise.resolve();
  await Promise.resolve();

  // (2) While the first render is parked, the inputs move and a SECOND wake is
  // delivered concurrently (e.g. a separate ingest() caller). It must COALESCE,
  // never spawn a second concurrent render.
  inputs.n = [asFingerprint("i2")];
  const secondPromise = handle.reconcileAsync({ node: "n", wake: inputWake });
  const secondResult = await secondPromise;
  equal(
    secondResult.disposition,
    "coalesced",
    "a wake landing during the in-flight awaited render coalesces, never a second concurrent render",
  );

  // At this point exactly ONE render has been spawned (the first, still parked).
  equal(renderCount, 1, "no second concurrent render while the first is in flight");

  // (3) Release the first render. The first reconcileAsync resolves; because the
  // node was marked dirty by the coalesced wake, it runs exactly ONE follow-up
  // render — against the FRESHEST inputs (i2).
  firstRenderGate.resolve();
  const firstResult = await firstPromise;

  equal(
    firstResult.disposition,
    "rendered",
    "the original reconcile resolves to the coalesced follow-up's rendered result",
  );

  // Exactly two renders total: the original + ONE coalesced follow-up. The
  // mid-render wake did not spawn its own concurrent render, and was not lost.
  equal(
    renderCount,
    2,
    "exactly one coalesced follow-up render — never a second concurrent render, never a lost wake",
  );

  // The follow-up was keyed against the FRESHEST inputs (i2), not the stale i1.
  deepEqual(
    renderedInputs[0],
    ["i1"],
    "the original render was keyed against i1",
  );
  deepEqual(
    renderedInputs[1],
    ["i2"],
    "the coalesced follow-up renders against the freshest inputs (i2)",
  );

  // The ledger holds exactly the two rendered receipts — no skip, no lost wake.
  const chain = ledger.chain("n");
  equal(chain.length, 2, "two receipts: the original render + the coalesced follow-up");
  equal(chain[0]?.status, "rendered");
  equal(chain[1]?.status, "rendered");
  deepEqual(chain[1]?.fingerprints, atomic("r2"));
});

test("coalescing-under-await: a coalesced follow-up whose inputs did NOT move skips (no redundant render)", async () => {
  // A wake lands mid-render but the inputs are unchanged ⇒ the follow-up re-keys,
  // finds the memo key unmoved, and SKIPS. Coalescing never forces a redundant
  // render (05 §1.3.4).
  const ledger = new FakeLedger();
  const inputs: Record<string, InputFingerprints> = { n: [asFingerprint("i1")] };
  const firstRenderGate = deferred<void>();
  let renderCount = 0;

  let handle: ReturnType<typeof createReconciler>;

  const ports: ReconcilerPorts = {
    ledger,
    worldModel: { publishedRef: (node) => fakeWorldModelRef(node) },
    resolveInputFingerprints: (node) => inputs[node] ?? [],
    spawnRender: () => {
      throw new Error("unused");
    },
    spawnRenderAsync: async (req: RenderRequest) => {
      renderCount += 1;
      if (renderCount === 1) {
        await firstRenderGate.promise;
      }
      // The first render publishes a fingerprint; on the follow-up the inputs are
      // unchanged so the memo key has not moved ⇒ skip.
      return renderedOutcome(req.node, "stable");
    },
  };
  const topo: ReconcilerTopology = {
    topology: singleNodeTopology,
    contract_fingerprints: { n: asFingerprint(CONTRACT_A) },
  };
  handle = createReconciler(ports, topo);

  const firstPromise = handle.reconcileAsync({ node: "n", wake: inputWake });
  await Promise.resolve();
  await Promise.resolve();

  // Mid-render wake, inputs UNCHANGED (still i1).
  const second = await handle.reconcileAsync({ node: "n", wake: inputWake });
  equal(second.disposition, "coalesced");

  firstRenderGate.resolve();
  const firstResult = await firstPromise;

  // The follow-up re-keys; inputs unmoved ⇒ skip ⇒ no second render.
  equal(
    firstResult.disposition,
    "skipped",
    "the coalesced follow-up re-keys and skips when inputs did not move",
  );
  equal(renderCount, 1, "coalescing never forces a redundant render");
});

test("coalescing-under-await: MANY wakes during one render collapse to a single follow-up against the LAST wake's inputs (last-writer-wins)", async () => {
  const ledger = new FakeLedger();
  const inputs: Record<string, InputFingerprints> = { n: [asFingerprint("i1")] };
  const firstRenderGate = deferred<void>();
  let renderCount = 0;
  const renderedInputs: InputFingerprints[] = [];

  let handle: ReturnType<typeof createReconciler>;

  const ports: ReconcilerPorts = {
    ledger,
    worldModel: { publishedRef: (node) => fakeWorldModelRef(node) },
    resolveInputFingerprints: (node) => inputs[node] ?? [],
    spawnRender: () => {
      throw new Error("unused");
    },
    spawnRenderAsync: async (req: RenderRequest) => {
      renderCount += 1;
      renderedInputs.push([...req.input_fingerprints]);
      if (renderCount === 1) {
        await firstRenderGate.promise;
      }
      return renderedOutcome(req.node, `r${renderCount}`);
    },
  };
  const topo: ReconcilerTopology = {
    topology: singleNodeTopology,
    contract_fingerprints: { n: asFingerprint(CONTRACT_A) },
  };
  handle = createReconciler(ports, topo);

  const firstPromise = handle.reconcileAsync({ node: "n", wake: inputWake });
  await Promise.resolve();
  await Promise.resolve();

  // THREE wakes land during the in-flight render, each moving the inputs.
  inputs.n = [asFingerprint("i2")];
  const w1 = await handle.reconcileAsync({ node: "n", wake: inputWake });
  inputs.n = [asFingerprint("i3")];
  const w2 = await handle.reconcileAsync({ node: "n", wake: inputWake });
  inputs.n = [asFingerprint("i4")];
  const w3 = await handle.reconcileAsync({ node: "n", wake: inputWake });

  equal(w1.disposition, "coalesced");
  equal(w2.disposition, "coalesced");
  equal(w3.disposition, "coalesced");
  equal(renderCount, 1, "no concurrent renders while the first is in flight");

  firstRenderGate.resolve();
  await firstPromise;

  // Exactly ONE follow-up render — the three coalesced wakes collapse to one,
  // keyed against the LAST (freshest) inputs i4 (last-writer-wins).
  equal(renderCount, 2, "three coalesced wakes collapse to a single follow-up render");
  deepEqual(
    renderedInputs[1],
    ["i4"],
    "the single follow-up renders against the freshest inputs (i4, last-writer-wins)",
  );
});
