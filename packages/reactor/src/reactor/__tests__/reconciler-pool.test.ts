// Tests for EXPERIMENT B — the opt-in node-level render worker pool
// (spec 02 Part III §9, Change B): `createReconciler(ports, topology,
// { maxConcurrency })`.
//
// The five mandatory assertions:
//   (1) GENUINE OVERLAP — independent ready nodes render concurrently
//       (max in-flight observed > 1); excess queues, nothing is lost.
//   (2) DEPENDENT CHAINS ORDERED — a downstream node never renders before the
//       upstream settle that feeds it; the join renders once, never against a
//       stale producer.
//   (3) SAME-NODE SINGLE-FLIGHT — a wake delivered mid-render coalesces into
//       exactly ONE follow-up against the freshest inputs, under the pool.
//   (4) SERIAL EQUIVALENCE — final dispositions, world-model fingerprints, and
//       per-node receipt chains (REAL content-addressed ledger) are identical
//       to a maxConcurrency:1 run of the same wakes, under adversarial delays.
//   (5) DEFAULT UNCHANGED — no options (or maxConcurrency:1) stays strictly
//       serial; the option only touches `drainAsync`.
// Plus: option validation (fail closed), zero-token memo-skips under the pool,
// failure isolation, and thrown-render fail-closed (no abandoned promises, no
// unhandled rejection).
//
// Run: built into dist by `pnpm build`, executed by `node --test`. Offline by
// construction — pure stubs, no model, no network.

import { deepEqual, equal, ok, rejects, throws } from "node:assert/strict";
import { test } from "node:test";

import {
  ATOMIC_FACET,
  type ContentAddress,
  type Cost,
  type FingerprintMap,
  type InputFingerprints,
  type Receipt,
  type TopologyEdge,
  type TopologyWorldModel,
  type Wake,
  type WorldModelCommit,
  type WorldModelRef,
  asFingerprint,
  asNodeId,
} from "../../shapes";
import {
  type ReconcileDisposition,
  type ReconcilerOptions,
  type ReconcilerPorts,
  type ReconcilerTopology,
  type RenderOutcome,
  type RenderRequest,
  createReconciler,
} from "../index";
import { verifyReceiptChain } from "../../receipt";
import { InMemoryReceiptLedger, resolveInputs } from "../../sdk/mounted-dag";

// --------------------------------------------------------------------------
// Fakes (mirrors reconciler-async.test.ts; kept local so the pool experiment
// is legible in one file).
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
const externalWake: Wake = { source: "external", refs: [] };

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

/** Deterministic render output: a pure function of (node, inputs), so serial
 * and pooled runs publish byte-identical fingerprints regardless of completion
 * order (the equivalence test's substrate). */
function deterministicOutcome(req: RenderRequest): RenderOutcome {
  const token = `out:${req.node}:${req.input_fingerprints.map(String).join("|")}`;
  const commit: WorldModelCommit = {
    node: asNodeId(req.node),
    version: ("sha256:" + "d".repeat(64)) as ContentAddress,
    fingerprints: atomic(token),
  };
  // The REAL ledger enforces cost.surprise_cause === wake.source on append.
  const cost: Cost = { ...RENDER_COST, surprise_cause: req.wake.source };
  return { status: "rendered", commit, semantic_diff: {}, cost };
}

// --------------------------------------------------------------------------
// The pool harness — the asyncChainHarness of reconciler-async.test.ts
// extended with per-node gates/delays, in-flight counters, and an event log.
// --------------------------------------------------------------------------

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

interface PoolRender {
  node: string;
  inputs: { producer: string; fp: string }[];
}

function poolHarness(input: {
  edges: readonly { producer: string; subscriber: string }[];
  entryPoints: readonly string[];
  options?: ReconcilerOptions;
  /** setTimeout per node render (a real suspension). */
  delays?: Record<string, number>;
  /** Nodes whose renders park on a manually-released gate. */
  gateNodes?: readonly string[];
  /** Nodes whose renders return status:"failed". */
  failNodes?: readonly string[];
  /** Nodes whose renders REJECT (a thrown render — harness-bug path). */
  rejectNodes?: readonly string[];
}) {
  const edges = input.edges;
  const nodeIds = [
    ...new Set([
      ...edges.flatMap((e) => [e.producer, e.subscriber]),
      ...input.entryPoints,
    ]),
  ];
  const entrySet = new Set(input.entryPoints);
  const ledger = new FakeLedger();
  const published: Record<string, string> = {};
  for (const n of nodeIds) published[n] = "seed:" + n;
  let extInput = "ext:0";
  const renderCounts: Record<string, number> = {};
  for (const n of nodeIds) renderCounts[n] = 0;
  const renderLog: PoolRender[] = [];
  const events: string[] = [];
  const gates = new Map<string, ReturnType<typeof deferred<void>>>();
  for (const n of input.gateNodes ?? []) gates.set(n, deferred<void>());
  const failSet = new Set(input.failNodes ?? []);
  const rejectSet = new Set(input.rejectNodes ?? []);
  let inFlightNow = 0;
  let maxInFlightObserved = 0;

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
    entry_points: input.entryPoints.map((n) => asNodeId(n)),
    acyclic: true,
  };

  const ports: ReconcilerPorts = {
    ledger,
    worldModel: { publishedRef: (node) => fakeWorldModelRef(node) },
    resolveInputFingerprints: (node: string, inEdges: readonly TopologyEdge[]) =>
      entrySet.has(node)
        ? [asFingerprint(extInput)]
        : inEdges.map((e) =>
            asFingerprint(
              published[String(e.producer)] ?? "seed:" + String(e.producer),
            ),
          ),
    spawnRender: () => {
      throw new Error("sync spawnRender must not be used on the async path");
    },
    spawnRenderAsync: async (req: RenderRequest) => {
      const node = req.node;
      renderCounts[node] = (renderCounts[node] ?? 0) + 1;
      inFlightNow += 1;
      maxInFlightObserved = Math.max(maxInFlightObserved, inFlightNow);
      events.push("start:" + node);
      const seenInputs = req.input_fingerprints.map(String);
      renderLog.push({
        node,
        inputs: req.inbound_edges.map((e, i) => ({
          producer: String(e.producer),
          fp: seenInputs[i] ?? "",
        })),
      });
      try {
        const gate = gates.get(node);
        if (gate !== undefined) await gate.promise;
        const d = input.delays?.[node] ?? 0;
        if (d > 0) await new Promise<void>((r) => setTimeout(r, d));
        else await Promise.resolve();
        if (rejectSet.has(node)) throw new Error("boom:" + node);
        if (failSet.has(node)) {
          return {
            status: "failed",
            reason: "synthetic failure",
            cost: RENDER_COST,
          } satisfies RenderOutcome;
        }
        const token = `out:${node}:${seenInputs.join("|")}`;
        published[node] = token;
        const commit: WorldModelCommit = {
          node: asNodeId(node),
          version: ("sha256:" + "d".repeat(64)) as ContentAddress,
          fingerprints: atomic(token),
        };
        return {
          status: "rendered",
          commit,
          semantic_diff: {},
          cost: RENDER_COST,
        } satisfies RenderOutcome;
      } finally {
        inFlightNow -= 1;
        events.push("end:" + node);
      }
    },
  };

  const reconciler = createReconciler(
    ports,
    {
      topology,
      contract_fingerprints: Object.fromEntries(
        nodeIds.map((n) => [n, asFingerprint(CONTRACT_A)]),
      ),
    },
    input.options ?? {},
  );

  return {
    reconciler,
    ledger,
    renderCounts,
    renderLog,
    events,
    gates,
    publishedOf: (node: string): string => published[node] ?? "seed:" + node,
    maxInFlightObserved: () => maxInFlightObserved,
    resetBookkeeping: () => {
      for (const n of nodeIds) renderCounts[n] = 0;
      renderLog.length = 0;
      events.length = 0;
      maxInFlightObserved = 0;
    },
    bumpInput: () => {
      extInput = "ext:1";
    },
  };
}

type PoolHarness = ReturnType<typeof poolHarness>;

/** Cold-start a chain in dependency order, returning nothing (mirrors
 * coldStartAsync in reconciler-async.test.ts). */
async function coldStart(
  h: PoolHarness,
  order: readonly string[],
): Promise<void> {
  for (const n of order) {
    await h.reconciler.drainAsync([{ node: n, wake: inputWake }]);
  }
}

/** Flush a few microtask turns so unawaited drains reach their suspensions. */
async function flushMicrotasks(turns = 4): Promise<void> {
  for (let i = 0; i < turns; i += 1) await Promise.resolve();
}

const seedsFor = (nodes: readonly string[]): { node: string; wake: Wake }[] =>
  nodes.map((node) => ({ node, wake: externalWake }));

// ==========================================================================
// (1) GENUINE OVERLAP — independent ready nodes render concurrently
// ==========================================================================

test("pool (overlap): three independent seeds with maxConcurrency:3 all hold renders in flight at once", async () => {
  const h = poolHarness({
    edges: [],
    entryPoints: ["x", "y", "z"],
    options: { maxConcurrency: 3 },
    gateNodes: ["x", "y", "z"],
  });

  const drainPromise = h.reconciler.drainAsync(seedsFor(["x", "y", "z"]));
  await flushMicrotasks();

  // ALL THREE renders started BEFORE any gate is released — genuine overlap.
  equal(h.maxInFlightObserved(), 3, "three independent renders overlap");
  deepEqual(
    h.events.filter((e) => e.startsWith("start:")).sort(),
    ["start:x", "start:y", "start:z"],
    "every seed launched before any render settled",
  );
  equal(h.events.some((e) => e.startsWith("end:")), false);

  for (const g of h.gates.values()) g.resolve();
  const results = await drainPromise;

  equal(results.length, 3);
  for (const r of results) equal(r.disposition, "rendered");
});

test("pool (overlap): maxConcurrency:2 caps in-flight at 2 — the third seed queues and still completes", async () => {
  const h = poolHarness({
    edges: [],
    entryPoints: ["x", "y", "z"],
    options: { maxConcurrency: 2 },
    gateNodes: ["x", "y", "z"],
  });

  const drainPromise = h.reconciler.drainAsync(seedsFor(["x", "y", "z"]));
  await flushMicrotasks();

  equal(h.maxInFlightObserved(), 2, "the pool caps in-flight renders at 2");
  equal(
    h.events.filter((e) => e.startsWith("start:")).length,
    2,
    "the third seed queues behind the full pool",
  );

  for (const g of h.gates.values()) g.resolve();
  const results = await drainPromise;

  equal(results.length, 3, "the queued seed still completes — nothing lost");
  for (const r of results) equal(r.disposition, "rendered");
  equal(h.maxInFlightObserved(), 2, "the cap held for the whole drain");
});

// ==========================================================================
// (2) DEPENDENT CHAINS STAY ORDERED — topological ordering under the pool
// ==========================================================================

test("pool (ordering): staggered diamond under maxConcurrency:4 — downstreams start only after their upstream settles; the join renders ONCE against settled inputs", async () => {
  const h = poolHarness({
    edges: STAGGERED_DIAMOND,
    entryPoints: ["A"],
    options: { maxConcurrency: 4 },
    delays: { A: 5, B: 15, C: 25, E: 5 },
  });
  await coldStart(h, ["A", "B", "C", "E"]);
  h.resetBookkeeping();
  h.bumpInput();
  await h.reconciler.drainAsync([{ node: "A", wake: externalWake }]);

  const idx = (e: string): number => h.events.indexOf(e);
  ok(idx("start:B") > idx("end:A"), "B starts only after A settles");
  ok(idx("start:C") > idx("end:B"), "C starts only after B settles");
  ok(idx("start:E") > idx("end:C"), "E starts only after the LONG path settles");
  ok(idx("start:E") > idx("end:A"), "E starts only after the short edge settles");

  equal(h.renderCounts["E"], 1, "the join renders exactly once (no glitch fire)");
  equal(h.renderCounts["A"], 1);
  equal(h.renderCounts["B"], 1);
  equal(h.renderCounts["C"], 1);

  // E's single render saw the POST-WAVE C truth, never a stale C.
  const eRender = h.renderLog.find((x) => x.node === "E");
  const cInput = eRender?.inputs.find((i) => i.producer === "C");
  equal(cInput?.fp, h.publishedOf("C"), "E rendered against the settled C");
});

test("pool (ordering): symmetric diamond — the independent siblings B and C genuinely overlap while the join still waits for both", async () => {
  const h = poolHarness({
    edges: SYMMETRIC_DIAMOND,
    entryPoints: ["A"],
    options: { maxConcurrency: 4 },
    delays: { B: 15, C: 15 },
  });
  await coldStart(h, ["A", "B", "C", "E"]);
  h.resetBookkeeping();
  h.bumpInput();
  await h.reconciler.drainAsync([{ node: "A", wake: externalWake }]);

  equal(h.maxInFlightObserved(), 2, "B and C render concurrently");
  const idx = (e: string): number => h.events.indexOf(e);
  ok(idx("start:E") > idx("end:B"), "E waits for B");
  ok(idx("start:E") > idx("end:C"), "E waits for C");
  equal(h.renderCounts["E"], 1, "the join renders exactly once");
});

test("pool (wide fan): more ready nodes than slots — every node completes, the iteration guard holds", async () => {
  const children = Array.from({ length: 12 }, (_, i) =>
    "c" + String(i + 1).padStart(2, "0"),
  );
  const h = poolHarness({
    edges: children.map((c) => ({ producer: "S", subscriber: c })),
    entryPoints: ["S"],
    options: { maxConcurrency: 3 },
    delays: Object.fromEntries(children.map((c, i) => [c, (i % 3) + 1])),
  });

  const results = await h.reconciler.drainAsync([
    { node: "S", wake: externalWake },
  ]);

  equal(results.length, 13, "the seed + all 12 fan-out children completed");
  for (const r of results) equal(r.disposition, "rendered");
  equal(h.maxInFlightObserved(), 3, "the pool stayed at its cap");
});

// ==========================================================================
// (3) SAME-NODE SINGLE-FLIGHT under the pool (the 05 §1.3 invariant)
// ==========================================================================

test("pool (single-flight): an external wake landing while a pooled render is in flight coalesces into exactly ONE follow-up against the freshest inputs", async () => {
  const ledger = new FakeLedger();
  const inputs: Record<string, InputFingerprints> = { n: [asFingerprint("i1")] };
  const firstRenderGate = deferred<void>();
  let renderCount = 0;
  const renderedInputs: InputFingerprints[] = [];

  const ports: ReconcilerPorts = {
    ledger,
    worldModel: { publishedRef: (node) => fakeWorldModelRef(node) },
    resolveInputFingerprints: (node) => inputs[node] ?? [],
    spawnRender: () => {
      throw new Error("sync spawnRender must not be used on the async path");
    },
    spawnRenderAsync: async (req: RenderRequest) => {
      renderCount += 1;
      renderedInputs.push([...req.input_fingerprints]);
      if (renderCount === 1) await firstRenderGate.promise;
      const commit: WorldModelCommit = {
        node: asNodeId(req.node),
        version: ("sha256:" + "d".repeat(64)) as ContentAddress,
        fingerprints: atomic(`r${renderCount}`),
      };
      return { status: "rendered", commit, semantic_diff: {}, cost: RENDER_COST };
    },
  };
  const topo: ReconcilerTopology = {
    topology: {
      nodes: [],
      edges: [],
      entry_points: [asNodeId("n")],
      acyclic: true,
    },
    contract_fingerprints: { n: asFingerprint(CONTRACT_A) },
  };
  const handle = createReconciler(ports, topo, { maxConcurrency: 2 });

  // The POOLED drain launches n's render, which parks on the gate.
  const drainPromise = handle.drainAsync([{ node: "n", wake: inputWake }]);
  await flushMicrotasks();
  equal(renderCount, 1, "the pooled drain holds n's render in flight");

  // A concurrent external wake (inputs moved) must COALESCE — never a second
  // concurrent render for the same node, even with free pool slots.
  inputs.n = [asFingerprint("i2")];
  const external = await handle.reconcileAsync({ node: "n", wake: inputWake });
  equal(external.disposition, "coalesced");
  equal(renderCount, 1, "single-flight holds under the pool");

  firstRenderGate.resolve();
  const results = await drainPromise;

  equal(results.length, 1);
  equal(results[0]?.disposition, "rendered");
  equal(renderCount, 2, "exactly ONE coalesced follow-up — never lost, never doubled");
  deepEqual(renderedInputs[1], ["i2"], "the follow-up rendered the freshest inputs");
  equal(ledger.chain("n").length, 2, "original + follow-up receipts only");
});

// ==========================================================================
// (4) SERIAL EQUIVALENCE — identical truth + receipts vs maxConcurrency:1
// ==========================================================================

interface EquivalenceRun {
  dispositions: Record<string, ReconcileDisposition[]>;
  finalFingerprints: Record<string, FingerprintMap>;
  chains: Record<string, unknown[]>;
}

/** Drive cold drain + moved-input wave over the REAL content-addressed ledger
 * with fully deterministic renders; capture everything comparable. */
async function equivalenceRun(
  edges: readonly { producer: string; subscriber: string }[],
  options: ReconcilerOptions,
  delays: Record<string, number>,
): Promise<EquivalenceRun> {
  const nodeIds = [...new Set(edges.flatMap((e) => [e.producer, e.subscriber]))];
  const ledger = new InMemoryReceiptLedger();
  let extInput = "ext:0";

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
    // The PRODUCTION resolver (sdk/mounted-dag.ts): the producer's last receipt
    // IS the published-truth identity downstreams subscribe to.
    resolveInputFingerprints: (node: string, inEdges: readonly TopologyEdge[]) =>
      node === "A" ? [asFingerprint(extInput)] : resolveInputs(ledger, inEdges),
    spawnRender: () => {
      throw new Error("sync spawnRender must not be used on the async path");
    },
    spawnRenderAsync: async (req: RenderRequest) => {
      const d = delays[req.node] ?? 0;
      if (d > 0) await new Promise<void>((r) => setTimeout(r, d));
      else await Promise.resolve();
      return deterministicOutcome(req);
    },
  };

  const reconciler = createReconciler(
    ports,
    {
      topology,
      contract_fingerprints: Object.fromEntries(
        nodeIds.map((n) => [n, asFingerprint(CONTRACT_A)]),
      ),
    },
    options,
  );

  const dispositions: Record<string, ReconcileDisposition[]> = {};
  const record = (rs: readonly { node: string; disposition: ReconcileDisposition }[]) => {
    for (const r of rs) (dispositions[r.node] ??= []).push(r.disposition);
  };

  // Cold drain (the whole closure renders), then a moved-input incremental wave.
  record(await reconciler.drainAsync([{ node: "A", wake: externalWake }]));
  extInput = "ext:1";
  record(await reconciler.drainAsync([{ node: "A", wake: externalWake }]));

  const finalFingerprints: Record<string, FingerprintMap> = {};
  const chains: Record<string, unknown[]> = {};
  for (const n of nodeIds) {
    finalFingerprints[n] = ledger.lastReceipt(n)?.fingerprints ?? {};
    chains[n] = ledger.all().filter((r) => r.node === n);
  }
  return { dispositions, finalFingerprints, chains };
}

for (const [name, edges, pooledDelays] of [
  // Adversarial: the LONG path is slow, so a broken frontier would fire E early.
  ["staggered diamond", STAGGERED_DIAMOND, { B: 5, C: 20 }],
  // Adversarial: INVERTED sibling latencies — C settles before B, so naive
  // last-writer-wins at the join would record a different wake than serial.
  ["symmetric diamond", SYMMETRIC_DIAMOND, { B: 20, C: 5 }],
] as const) {
  test(`pool (serial equivalence, ${name}): pooled run is receipt-for-receipt identical to maxConcurrency:1`, async () => {
    const serial = await equivalenceRun(edges, { maxConcurrency: 1 }, {});
    const pooled = await equivalenceRun(edges, { maxConcurrency: 4 }, pooledDelays);

    deepEqual(
      pooled.dispositions,
      serial.dispositions,
      "per-node disposition history identical",
    );
    deepEqual(
      pooled.finalFingerprints,
      serial.finalFingerprints,
      "final published fingerprint maps identical",
    );
    for (const node of Object.keys(serial.chains)) {
      const verdict = verifyReceiptChain(pooled.chains[node] ?? []);
      equal(verdict.ok, true, `pooled receipt chain for "${node}" verifies`);
      // Receipt v0 is timestamp-free and content-addressed, and the frontier's
      // rank-deterministic wake writer pins join wake refs — so the pooled
      // chain is BYTE-IDENTICAL to the serial one, content hashes included.
      deepEqual(
        pooled.chains[node],
        serial.chains[node],
        `receipt chain for "${node}" identical to the serial run`,
      );
    }
  });
}

// ==========================================================================
// (5) DEFAULT UNCHANGED — no options ⇒ strictly serial drainAsync
// ==========================================================================

test("pool (default off): drainAsync with NO options never overlaps renders", async () => {
  const h = poolHarness({
    edges: [],
    entryPoints: ["x", "y", "z"],
    delays: { x: 5, y: 5, z: 5 },
  });

  const results = await h.reconciler.drainAsync(seedsFor(["x", "y", "z"]));

  equal(results.length, 3);
  equal(h.maxInFlightObserved(), 1, "the default path stays strictly serial");
});

test("pool (default off): an explicit maxConcurrency:1 is byte-for-byte the serial loop", async () => {
  const h = poolHarness({
    edges: [],
    entryPoints: ["x", "y", "z"],
    options: { maxConcurrency: 1 },
    delays: { x: 5, y: 5, z: 5 },
  });

  const results = await h.reconciler.drainAsync(seedsFor(["x", "y", "z"]));

  equal(results.length, 3);
  equal(h.maxInFlightObserved(), 1);
});

// ==========================================================================
// Option validation — fail closed at construction
// ==========================================================================

test("pool (validation): createReconciler throws TypeError on a malformed maxConcurrency", () => {
  const ports: ReconcilerPorts = {
    ledger: new FakeLedger(),
    worldModel: { publishedRef: (node) => fakeWorldModelRef(node) },
    resolveInputFingerprints: () => [],
    spawnRender: () => {
      throw new Error("unused");
    },
  };
  const topo: ReconcilerTopology = {
    topology: { nodes: [], edges: [], entry_points: [asNodeId("n")], acyclic: true },
    contract_fingerprints: { n: asFingerprint(CONTRACT_A) },
  };
  for (const bad of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    throws(
      () => createReconciler(ports, topo, { maxConcurrency: bad }),
      TypeError,
      `maxConcurrency ${String(bad)} must fail closed`,
    );
  }
});

// ==========================================================================
// Zero-token memo-skips stay free under the pool
// ==========================================================================

test("pool (skips stay free): a pooled re-drain of an unchanged seed writes a zero-token skipped receipt and renders NOTHING", async () => {
  const h = poolHarness({
    edges: STAGGERED_DIAMOND,
    entryPoints: ["A"],
    options: { maxConcurrency: 4 },
  });
  await h.reconciler.drainAsync([{ node: "A", wake: externalWake }]); // cold wave
  h.resetBookkeeping();

  const results = await h.reconciler.drainAsync([
    { node: "A", wake: externalWake },
  ]);

  equal(results.length, 1, "only the seed produced a receipt; the closure pruned");
  equal(results[0]?.disposition, "skipped");
  deepEqual(
    results[0]?.receipt?.cost.tokens,
    { fresh: 0, reused: 0 },
    "the skip is zero-token",
  );
  equal(
    Object.values(h.renderCounts).reduce((a, b) => a + b, 0),
    0,
    "no render spawned anywhere in the pooled re-drain",
  );
});

// ==========================================================================
// Failure isolation + thrown-render fail-closed
// ==========================================================================

test("pool (failure isolation): one failed render — its downstream prunes, the concurrent sibling commits normally, the drain completes", async () => {
  const h = poolHarness({
    edges: [{ producer: "x", subscriber: "d" }],
    entryPoints: ["x", "y"],
    options: { maxConcurrency: 2 },
    failNodes: ["x"],
    gateNodes: ["y"],
  });

  const drainPromise = h.reconciler.drainAsync(seedsFor(["x", "y"]));
  await flushMicrotasks();
  // x has already failed while y is STILL mid-render (parked on its gate).
  equal(h.events.includes("end:x"), true);
  equal(h.events.includes("end:y"), false);

  h.gates.get("y")?.resolve();
  const results = await drainPromise;

  const byNode = new Map(results.map((r) => [r.node, r]));
  equal(byNode.get("x")?.disposition, "failed");
  equal(byNode.get("y")?.disposition, "rendered", "the sibling is isolated");
  equal(byNode.has("d"), false, "the failed node's downstream pruned (no receipt)");
  equal(h.renderCounts["d"], 0, "the pruned downstream never rendered");
  equal(h.ledger.chain("x").length, 1);
  equal(h.ledger.chain("x")[0]?.status, "failed", "fail closed: a failed receipt, prior truth stands");
  equal(h.ledger.chain("d").length, 0);
});

test("pool (thrown render): the drain rethrows only AFTER the in-flight sibling settles and commits — no abandoned promise, no unhandled rejection", async () => {
  let unhandled = 0;
  const onUnhandled = (): void => {
    unhandled += 1;
  };
  process.on("unhandledRejection", onUnhandled);
  try {
    const h = poolHarness({
      edges: [],
      entryPoints: ["x", "y"],
      options: { maxConcurrency: 2 },
      rejectNodes: ["x"],
      gateNodes: ["y"],
    });

    const drainPromise = h.reconciler.drainAsync(seedsFor(["x", "y"]));
    await flushMicrotasks();
    // x's render has already REJECTED; y is still parked — the drain must wait.
    equal(h.events.includes("end:x"), true);
    equal(h.events.includes("end:y"), false);

    h.gates.get("y")?.resolve();
    await rejects(drainPromise, /boom:x/, "the drain fails closed with the thrown error");

    // The sibling was awaited to completion AND its receipt committed BEFORE
    // the rethrow — nothing abandoned.
    equal(h.events.includes("end:y"), true);
    equal(h.ledger.chain("y").length, 1);
    equal(h.ledger.chain("y")[0]?.status, "rendered");
    // x committed NOTHING (a thrown render is the harness-bug path; the SDK
    // mount maps render throws to failed receipts before this seam).
    equal(h.ledger.chain("x").length, 0);

    await flushMicrotasks(8);
    equal(unhandled, 0, "no unhandled rejection escaped the pooled drain");
  } finally {
    process.removeListener("unhandledRejection", onUnhandled);
  }
});
