// Depth-audit of the architecture.md §8 run-phase slice mechanics.
//
// The individual pieces of these mechanics are unit-tested in their owning
// modules (composition pins, world-model `readVersion`, the reconciler's
// single-flight/coalescing). This file proves the two SEAMS that join those
// pieces end-to-end — the properties §8 actually claims — so the mechanics are
// demonstrably REAL, not named stubs:
//
//   (a) Cross-node read-isolation (architecture.md §8 L328–L330): "a render PINS
//       a content-addressed snapshot of each input world-model (by fingerprint/
//       version) at render start, so a concurrent upstream commit can't cause a
//       torn read." Joins `pinConsumedWorldModel` (the pin) to the store's
//       `readVersion` (the durable content-addressed read) over the REAL store.
//
//   (c) Dirty/coalesce crash re-derivation (architecture.md §8 L345–L347):
//       "reconciler state; on crash it is re-derived from unconsumed upstream
//       receipts (the ledger is the source of truth)." Proves a FRESH reconciler
//       (whose in-process single-flight/dirty `Map` is gone, as after a crash)
//       re-derives the correct skip-vs-render decision purely from the persisted
//       ledger — the prior decision is re-derived, never lost.

import { deepEqual, equal, ok } from "node:assert/strict";
import { test } from "node:test";

import {
  ATOMIC_FACET,
  type ContentAddress,
  type Cost,
  type Fingerprint,
  type FingerprintMap,
  type InputFingerprints,
  type Receipt,
  type TopologyWorldModel,
  type Wake,
  type WorldModelCommit, asFingerprint, asNodeId} from "../../shapes";
import {
  InMemoryWorldModelStore,
  jsonFile,
  readTextFile,
} from "../../world-model";
import { pinConsumedWorldModel } from "../../composition";
import {
  type ReconcilerPorts,
  type ReconcilerTopology,
  type RenderOutcome,
  createReconciler,
} from "../../reactor";

// ===========================================================================
// (a) Cross-node read-isolation: pin → readVersion survives a concurrent commit
// ===========================================================================

test("§8 read-isolation: a render's pin reads its start-version snapshot even after a concurrent upstream commit (no torn read)", () => {
  const store = new InMemoryWorldModelStore();

  // The producer publishes v1; a subscriber wakes and PINS it at render start.
  const v1 = store.commitPublished("producer", {
    "truth.json": jsonFile({ status: "ok", at: 1 }),
  });
  const pin = pinConsumedWorldModel({
    producer: "producer",
    facet: ATOMIC_FACET,
    world_model: store.ref("producer"),
    fingerprints: store.publishedFingerprints("producer"),
  });
  equal(pin.version, v1.version);

  // CONCURRENT upstream commit while the subscriber's render is in flight: the
  // producer's published pointer moves to v2.
  const v2 = store.commitPublished("producer", {
    "truth.json": jsonFile({ status: "DEGRADED", at: 2 }),
  });
  ok(v2.version !== v1.version, "the concurrent commit moved the published pointer");
  equal(store.ref("producer").version, v2.version, "live pointer is now v2");

  // The render reads THROUGH its pin (the content address it captured at start),
  // not the live pointer — so it sees the v1 snapshot, untorn by the concurrent
  // commit (architecture.md §8 L328–L330).
  const isolated = store.readVersion("producer", pin.version);
  ok(isolated, "the pinned version is still resolvable");
  deepEqual(JSON.parse(readTextFile(isolated!.files["truth.json"]!)), {
    status: "ok",
    at: 1,
  });
  equal(isolated!.ref.version, pin.version);
});

// ===========================================================================
// (c) Dirty/coalesce crash re-derivation from the persisted ledger
// ===========================================================================

const CONTRACT = ("sha256:" + "a".repeat(64)) as Fingerprint;

const oneNode: TopologyWorldModel = {
  nodes: [{ node: asNodeId("n"), contract_fingerprint: CONTRACT, wake_source: "input" }],
  edges: [],
  entry_points: [],
  acyclic: true,
};

const RENDER_COST: Cost = {
  provider: "test",
  model: "m",
  tokens: { fresh: 100, reused: 0 },
  surprise_cause: "input",
};

const inputWake: Wake = { source: "input", refs: [] };

/**
 * A DURABLE node-scoped ledger fake: it is the source of truth that survives a
 * "crash" (a fresh reconciler is built over the SAME ledger). Reconciler
 * single-flight/dirty state is NOT persisted here — only receipts are, exactly
 * as architecture.md §8 specifies ("the ledger is the source of truth").
 */
class DurableLedger {
  private readonly byNode = new Map<string, Receipt[]>();
  private readonly addr = new Map<Receipt, ContentAddress>();
  private seq = 0;

  lastReceipt = (node: string): Receipt | null => {
    const chain = this.byNode.get(node);
    return chain && chain.length > 0 ? (chain[chain.length - 1] as Receipt) : null;
  };
  append = (receipt: Receipt): ContentAddress => {
    this.seq += 1;
    const address = ("sha256:" + String(this.seq).padStart(64, "0")) as ContentAddress;
    this.addr.set(receipt, address);
    const chain = this.byNode.get(receipt.node) ?? [];
    chain.push(receipt);
    this.byNode.set(receipt.node, chain);
    return address;
  };
  addressOf = (receipt: Receipt): ContentAddress | null => this.addr.get(receipt) ?? null;
}

function portsOver(
  ledger: DurableLedger,
  inputs: { current: InputFingerprints },
  renderCounter: { n: number },
): ReconcilerPorts {
  return {
    ledger,
    worldModel: {
      publishedRef: (node) => ({
        node: asNodeId(node),
        workspace: "published",
        location: `/wm/${node}`,
        version: null,
      }),
    },
    resolveInputFingerprints: () => inputs.current,
    spawnRender: (req): RenderOutcome => {
      renderCounter.n += 1;
      const commit: WorldModelCommit = {
        node: asNodeId(req.node),
        version: ("sha256:" + "c".repeat(64)) as ContentAddress,
        fingerprints: { [ATOMIC_FACET]: asFingerprint("fp:rendered") } as FingerprintMap,
      };
      return { status: "rendered", commit, semantic_diff: {}, cost: RENDER_COST };
    },
  };
}

const topo: ReconcilerTopology = {
  topology: oneNode,
  contract_fingerprints: { n: CONTRACT },
};

test("§8 crash re-derivation: a fresh reconciler over the persisted ledger SKIPS when inputs are unmoved (state re-derived, not lost)", () => {
  const ledger = new DurableLedger();
  const inputs = { current: [asFingerprint("i1")] as InputFingerprints };
  const renders = { n: 0 };

  // Epoch 1: cold render commits a receipt to the durable ledger.
  const before = createReconciler(portsOver(ledger, inputs, renders), topo);
  equal(before.reconcile({ node: "n", wake: inputWake }).disposition, "rendered");
  equal(renders.n, 1);

  // CRASH: drop the reconciler (its single-flight/dirty Map is gone). Build a
  // BRAND-NEW reconciler over the SAME ledger — the only surviving state.
  const after = createReconciler(portsOver(ledger, inputs, renders), topo);

  // Inputs unmoved since the persisted receipt ⇒ the fresh reconciler re-derives
  // the skip purely from the ledger's lastReceipt; it does NOT re-render.
  const result = after.reconcile({ node: "n", wake: inputWake });
  equal(result.disposition, "skipped");
  equal(renders.n, 1, "no redundant render after the crash — the prior decision was re-derived");
});

test("§8 crash re-derivation: a fresh reconciler RENDERS when an upstream moved while it was down (a missed wake is re-derived, not lost)", () => {
  const ledger = new DurableLedger();
  const inputs = { current: [asFingerprint("i1")] as InputFingerprints };
  const renders = { n: 0 };

  const before = createReconciler(portsOver(ledger, inputs, renders), topo);
  before.reconcile({ node: "n", wake: inputWake }); // cold render persists a receipt
  equal(renders.n, 1);

  // While the reconciler was "down", the upstream truth moved (its current
  // input-fingerprint tuple differs from the one the persisted receipt consumed).
  inputs.current = [asFingerprint("i2")];

  // CRASH + restart: a fresh reconciler re-derives the pending work from the
  // ledger (last receipt's memo key vs. the now-moved inputs) and renders.
  const after = createReconciler(portsOver(ledger, inputs, renders), topo);
  const result = after.reconcile({ node: "n", wake: inputWake });
  equal(result.disposition, "rendered");
  equal(renders.n, 2, "the missed upstream move is re-derived from the ledger and rendered");
});
