// EXPERIMENT A — the opt-in ENFORCED fresh-token budget (cost/budget.ts wired
// at mountDag's spawn ports). Proves, offline (no key, no network):
//
//   (i)   renders STOP past the ceiling, mid-drain, on both the sync and async
//         spawn paths — the refusal is a zero-cost `failed` receipt carrying
//         the BUDGET_EXHAUSTED_MODEL marker; nothing commits, nothing
//         propagates;
//   (ii)  the prior truth STANDS under refusal (the failed receipt copies the
//         node's prior fingerprints forward, byte-for-byte);
//   (iii) memo-SKIPS stay FREE and unblocked — a skip is decided in the
//         reconciler before any spawn port, so an exhausted ceiling can
//         neither block nor charge it;
//   (iv)  refusal stays LIVE (a failed receipt is never memoized into a
//         poisoned skip): every later wake re-refuses at zero cost until the
//         ceiling changes;
//   (v)   refusal receipts CHAIN like any failure (verifyReceiptChain green);
//   (vi)  the Workflow-shaped accessors report (`total`/`spent()`/`remaining()`,
//         null/Infinity when unset) and the option validates;
//   (vii) budget-OFF behavior is unchanged (the default is OFF everywhere).

import { deepEqual, equal, ok, throws } from "node:assert/strict";
import { test } from "node:test";

import { mountDag, type AsyncMountedRender, type MountedRender } from "../mounted-dag";
import { createReactor } from "../create-reactor";
import {
  createBudgetTracker,
  isBudgetExhaustedReceipt,
  BUDGET_EXHAUSTED_MODEL,
} from "../../cost/budget";
import { verifyReceiptChain } from "../../receipt";
import {
  jsonFile,
  files,
  readTextFile,
  InMemoryWorldModelStore,
  type Canonicalizer,
} from "../../world-model";
import { createMemoryStorageAdapter } from "../../adapters/storage-memory";
import { createSystemClockAdapter } from "../../adapters/clock-system";
import {
  ATOMIC_FACET,
  asFingerprint,
  asNodeId,
  type Cost,
  type WakeSource,
} from "../../shapes";
import { type ReconcilerTopology } from "../../reactor";

const PRODUCER = "responsibility.vendor-truth";
const SUBSCRIBER = "responsibility.renewal-watch";
const TAIL = "responsibility.renewal-digest";

// Fingerprint only the material `status` so "moved vs unmoved" is deterministic.
const statusCanon: Canonicalizer = (wm) => {
  const parsed = JSON.parse(readTextFile(wm["t.json"] as Uint8Array));
  return { [ATOMIC_FACET]: asFingerprint(`status:${parsed.status}`) };
};

/** A declared-token-cost render outcome (the budget charges `tokens.fresh`). */
function cost(surprise_cause: WakeSource, fresh = 80): Cost {
  return {
    provider: "test",
    model: "test-model",
    tokens: { fresh, reused: 0 },
    surprise_cause,
  };
}

/** The two-node PRODUCER → SUBSCRIBER topology (the mounted-dag idiom). */
function topology(): ReconcilerTopology {
  return {
    topology: {
      nodes: [
        { node: asNodeId(PRODUCER), contract_fingerprint: asFingerprint("c:producer@1"), wake_source: "external" },
        { node: asNodeId(SUBSCRIBER), contract_fingerprint: asFingerprint("c:subscriber@1"), wake_source: "input" },
      ],
      edges: [{ subscriber: asNodeId(SUBSCRIBER), producer: asNodeId(PRODUCER), facet: ATOMIC_FACET }],
      entry_points: [asNodeId(PRODUCER)],
      acyclic: true,
    },
    contract_fingerprints: {
      [PRODUCER]: asFingerprint("c:producer@1"),
      [SUBSCRIBER]: asFingerprint("c:subscriber@1"),
    },
  };
}

/** A three-node chain PRODUCER → SUBSCRIBER → TAIL (exhaustion mid-drain). */
function chainTopology(): ReconcilerTopology {
  const base = topology();
  return {
    topology: {
      ...base.topology,
      nodes: [
        ...base.topology.nodes,
        { node: asNodeId(TAIL), contract_fingerprint: asFingerprint("c:tail@1"), wake_source: "input" },
      ],
      edges: [
        ...base.topology.edges,
        { subscriber: asNodeId(TAIL), producer: asNodeId(SUBSCRIBER), facet: ATOMIC_FACET },
      ],
    },
    contract_fingerprints: {
      ...base.contract_fingerprints,
      [TAIL]: asFingerprint("c:tail@1"),
    },
  };
}

function statusRender(status: string, fresh = 80): MountedRender {
  return (ctx) => ({
    world_model: files({ "t.json": jsonFile({ status }) }),
    cost: cost(ctx.wake.source, fresh),
  });
}

function asyncStatusRender(status: string, fresh = 80): AsyncMountedRender {
  return async (ctx) => {
    await Promise.resolve();
    return {
      world_model: files({ "t.json": jsonFile({ status }) }),
      cost: cost(ctx.wake.source, fresh),
    };
  };
}

// ===========================================================================
// (i) renders stop past the ceiling — sync spawn path, mid-drain
// ===========================================================================

test("budget: renders stop past the ceiling mid-drain (sync) — the refused node fails closed at zero cost", () => {
  // Ceiling 100; each render declares 80 fresh. Dispatch-time enforcement:
  // PRODUCER fires at spent 0 (< 100), SUBSCRIBER at spent 80 (< 100) — the
  // overshoot is deliberate Workflow semantics (refuse NEW work, never abort) —
  // and TAIL's dispatch at spent 160 (>= 100) REFUSES.
  const dag = mountDag({
    topology: chainTopology(),
    budget: { maxFreshTokens: 100 },
    mounts: {
      [PRODUCER]: { render: statusRender("active"), canonicalizer: statusCanon },
      [SUBSCRIBER]: { render: statusRender("watching"), canonicalizer: statusCanon },
      [TAIL]: { render: statusRender("digested"), canonicalizer: statusCanon },
    },
  });

  const results = dag.ingest(PRODUCER);

  equal(results.find((r) => r.node === PRODUCER)?.disposition, "rendered");
  equal(results.find((r) => r.node === SUBSCRIBER)?.disposition, "rendered");
  const tail = results.find((r) => r.node === TAIL);
  equal(tail?.disposition, "failed");

  // The refusal receipt: zero cost, the durable marker, no propagation.
  const receipt = tail?.receipt;
  ok(receipt);
  equal(receipt?.status, "failed");
  deepEqual(receipt?.cost.tokens, { fresh: 0, reused: 0 });
  equal(receipt?.cost.model, BUDGET_EXHAUSTED_MODEL);
  equal(receipt?.cost.provider, "none");
  ok(isBudgetExhaustedReceipt(receipt!));
  deepEqual(tail?.propagated, []);
  // The refused node never committed a published world-model.
  equal(dag.store.ref(TAIL).version, null);

  // The Workflow-shaped accessors report the session truth.
  equal(dag.budget?.total, 100);
  equal(dag.budget?.spent(), 160);
  equal(dag.budget?.remaining(), 0);

  // (v) Every per-node trail — including the refusal — chain-verifies.
  for (const node of [PRODUCER, SUBSCRIBER, TAIL]) {
    const chain = dag.ledger.all().filter((r) => r.node === node);
    equal(verifyReceiptChain(chain).ok, true, `chain for ${node} must verify`);
  }
});

// ===========================================================================
// (i async) the same enforcement on the async spawn path
// ===========================================================================

test("budget: renders stop past the ceiling mid-drain (async) — spawnRenderAsync parity", async () => {
  const dag = mountDag({
    topology: chainTopology(),
    budget: { maxFreshTokens: 100 },
    mounts: {},
    asyncMounts: {
      [PRODUCER]: { render: asyncStatusRender("active"), canonicalizer: statusCanon },
      [SUBSCRIBER]: { render: asyncStatusRender("watching"), canonicalizer: statusCanon },
      [TAIL]: { render: asyncStatusRender("digested"), canonicalizer: statusCanon },
    },
  });

  const results = await dag.ingestAsync(PRODUCER);

  equal(results.find((r) => r.node === PRODUCER)?.disposition, "rendered");
  equal(results.find((r) => r.node === SUBSCRIBER)?.disposition, "rendered");
  const tail = results.find((r) => r.node === TAIL);
  equal(tail?.disposition, "failed");
  ok(isBudgetExhaustedReceipt(tail!.receipt!));
  deepEqual(tail?.receipt?.cost.tokens, { fresh: 0, reused: 0 });
  equal(dag.store.ref(TAIL).version, null);
  equal(dag.budget?.spent(), 160);
  equal(dag.budget?.remaining(), 0);
});

// ===========================================================================
// (ii) prior truth stands — the refusal copies the prior fingerprints forward
// ===========================================================================

test("budget: an exhausted ceiling refuses a MOVED wake — the prior truth stands, byte-for-byte", () => {
  // Session 1 (no budget): render the producer + subscriber, committing truth.
  const dag1 = mountDag({
    topology: topology(),
    mounts: {
      [PRODUCER]: { render: statusRender("active"), canonicalizer: statusCanon },
      [SUBSCRIBER]: { render: statusRender("derived"), canonicalizer: statusCanon },
    },
  });
  dag1.ingest(PRODUCER);
  const priorReceipt = dag1.ledger.lastReceipt(PRODUCER);
  ok(priorReceipt);
  equal(priorReceipt?.status, "rendered");

  // Session 2: the producer's contract fingerprint is BUMPED (a genuine memo
  // miss — the moved-fingerprint idiom) over the SAME store + ledger, but the
  // session ceiling is 0 — the dispatch must refuse, not render.
  const base = topology();
  const bumped: ReconcilerTopology = {
    topology: {
      ...base.topology,
      nodes: base.topology.nodes.map((n) =>
        n.node === PRODUCER ? { ...n, contract_fingerprint: asFingerprint("c:producer@2") } : n,
      ),
    },
    contract_fingerprints: { ...base.contract_fingerprints, [PRODUCER]: asFingerprint("c:producer@2") },
  };
  let renders = 0;
  const dag2 = mountDag({
    topology: bumped,
    store: dag1.store,
    ledger: dag1.ledger,
    budget: { maxFreshTokens: 0 },
    mounts: {
      [PRODUCER]: {
        render: (ctx) => {
          renders += 1;
          return statusRender("churned")(ctx);
        },
        canonicalizer: statusCanon,
      },
      [SUBSCRIBER]: { render: statusRender("derived"), canonicalizer: statusCanon },
    },
  });

  const results = dag2.ingest(PRODUCER);
  const producer = results.find((r) => r.node === PRODUCER);
  equal(producer?.disposition, "failed");
  ok(isBudgetExhaustedReceipt(producer!.receipt!));
  // The render body was NEVER called — the refusal happens at dispatch.
  equal(renders, 0);
  // Prior truth stands: the failed receipt copies the prior fingerprints
  // forward, and the committed world-model is untouched.
  deepEqual(producer?.receipt?.fingerprints, priorReceipt?.fingerprints);
  deepEqual(
    dag2.store.publishedFingerprints(PRODUCER),
    dag1.store.publishedFingerprints(PRODUCER),
  );
  // No propagation: the subscriber never woke.
  equal(results.find((r) => r.node === SUBSCRIBER), undefined);

  // The cross-session trail (rendered → refused) still chain-verifies.
  const chain = dag2.ledger.all().filter((r) => r.node === PRODUCER);
  equal(chain.length, 2);
  equal(verifyReceiptChain(chain).ok, true);
});

// ===========================================================================
// (iii) skips are free: never blocked, never charged
// ===========================================================================

test("budget: a memo-skip is never blocked or charged by an exhausted ceiling", () => {
  // Ceiling 80: the producer's first render exactly exhausts it (the
  // subscriber's dispatch then refuses).
  const dag = mountDag({
    topology: topology(),
    budget: { maxFreshTokens: 80 },
    mounts: {
      [PRODUCER]: { render: statusRender("active"), canonicalizer: statusCanon },
      [SUBSCRIBER]: { render: statusRender("derived"), canonicalizer: statusCanon },
    },
  });

  const first = dag.ingest(PRODUCER);
  equal(first.find((r) => r.node === PRODUCER)?.disposition, "rendered");
  equal(first.find((r) => r.node === SUBSCRIBER)?.disposition, "failed");
  const spentBefore = dag.budget?.spent();
  equal(spentBefore, 80);

  // The UNMOVED producer re-ingested under the exhausted ceiling: the memo
  // decision precedes the spawn port, so the skip goes through untouched.
  const second = dag.ingest(PRODUCER);
  const producer = second.find((r) => r.node === PRODUCER);
  equal(producer?.disposition, "skipped");
  deepEqual(producer?.receipt?.cost.tokens, { fresh: 0, reused: 0 });
  // Neither blocked nor charged: spent() is unchanged.
  equal(dag.budget?.spent(), spentBefore);

  // (v) The refusal + skip trails chain-verify.
  for (const node of [PRODUCER, SUBSCRIBER]) {
    const chain = dag.ledger.all().filter((r) => r.node === node);
    equal(verifyReceiptChain(chain).ok, true, `chain for ${node} must verify`);
  }
});

// ===========================================================================
// (iv) refusal stays live — failed is never memoized into a poisoned skip
// ===========================================================================

test("budget: maxFreshTokens 0 refuses the very FIRST render, and re-refuses on every later wake", () => {
  let renders = 0;
  const dag = mountDag({
    topology: topology(),
    budget: { maxFreshTokens: 0 },
    mounts: {
      [PRODUCER]: {
        render: (ctx) => {
          renders += 1;
          return statusRender("active")(ctx);
        },
        canonicalizer: statusCanon,
      },
      [SUBSCRIBER]: { render: statusRender("derived"), canonicalizer: statusCanon },
    },
  });

  const first = dag.ingest(PRODUCER);
  equal(first.find((r) => r.node === PRODUCER)?.disposition, "failed");

  // A failed receipt is deliberately NOT memoizable: the next wake re-attempts
  // the dispatch and re-refuses at zero cost — never a render, never a
  // poisoned permanent skip.
  const second = dag.ingest(PRODUCER);
  equal(second.find((r) => r.node === PRODUCER)?.disposition, "failed");

  equal(renders, 0);
  equal(dag.budget?.spent(), 0);
  const chain = dag.ledger.all().filter((r) => r.node === PRODUCER);
  equal(chain.length, 2);
  ok(chain.every((r) => isBudgetExhaustedReceipt(r)));
  equal(verifyReceiptChain(chain).ok, true);
});

// ===========================================================================
// (vi) the accessors + option validation
// ===========================================================================

test("budget: the Workflow-shaped accessors — null/Infinity when unset, monotone spent, floored remaining", () => {
  // Unset: the unlimited view.
  const unlimited = createBudgetTracker();
  equal(unlimited.view.total, null);
  equal(unlimited.view.spent(), 0);
  equal(unlimited.view.remaining(), Infinity);
  equal(unlimited.exhausted(), false);
  unlimited.charge(cost("external", 1_000_000));
  equal(unlimited.view.spent(), 1_000_000);
  equal(unlimited.view.remaining(), Infinity);
  equal(unlimited.exhausted(), false);

  // Set: spent is monotone; remaining floors at 0 past the ceiling.
  const bounded = createBudgetTracker({ maxFreshTokens: 100 });
  equal(bounded.view.total, 100);
  equal(bounded.exhausted(), false);
  bounded.charge(cost("external", 60));
  equal(bounded.view.spent(), 60);
  equal(bounded.view.remaining(), 40);
  bounded.charge(cost("external", 60));
  equal(bounded.view.spent(), 120);
  equal(bounded.view.remaining(), 0);
  equal(bounded.exhausted(), true);

  // The option validates: non-negative safe integers only.
  throws(() => createBudgetTracker({ maxFreshTokens: -1 }), TypeError);
  throws(() => createBudgetTracker({ maxFreshTokens: Number.NaN }), TypeError);
  throws(() => createBudgetTracker({ maxFreshTokens: 1.5 }), TypeError);
  throws(() => createBudgetTracker({ maxFreshTokens: Infinity }), TypeError);
  // ... and at the mount seam too.
  throws(
    () => mountDag({ topology: topology(), mounts: {}, budget: { maxFreshTokens: -1 } }),
    TypeError,
  );
});

// ===========================================================================
// (vii) budget-off behavior is unchanged (the default is OFF)
// ===========================================================================

test("budget OFF: behavior is unchanged — no refusals anywhere, unlimited accessors, free observation", () => {
  const dag = mountDag({
    topology: topology(),
    mounts: {
      [PRODUCER]: { render: statusRender("active"), canonicalizer: statusCanon },
      [SUBSCRIBER]: { render: statusRender("derived"), canonicalizer: statusCanon },
    },
  });

  const first = dag.ingest(PRODUCER);
  equal(first.find((r) => r.node === PRODUCER)?.disposition, "rendered");
  equal(first.find((r) => r.node === SUBSCRIBER)?.disposition, "rendered");
  const second = dag.ingest(PRODUCER);
  equal(second.find((r) => r.node === PRODUCER)?.disposition, "skipped");

  // No refusal marker anywhere in the trail; nothing failed.
  ok(dag.ledger.all().every((r) => r.status !== "failed"));
  ok(dag.ledger.all().every((r) => !isBudgetExhaustedReceipt(r)));

  // The accessor still reports (observation is free): unlimited semantics.
  equal(dag.budget?.total, null);
  equal(dag.budget?.remaining(), Infinity);
  // spent() observes the session's committed fresh sum (2 renders × 80).
  equal(dag.budget?.spent(), 160);
});

// ===========================================================================
// the handle threading — createReactor({ budget }) → reactor.budget
// ===========================================================================

test("budget: createReactor threads the option to the typed handle; boot past a 0 ceiling writes refusal receipts", async () => {
  const reactor = createReactor({
    adapters: {
      clock: createSystemClockAdapter(),
      storage: createMemoryStorageAdapter(),
      worldModel: new InMemoryWorldModelStore(),
    },
    topology: topology(),
    mounts: {
      [PRODUCER]: { render: statusRender("active"), canonicalizer: statusCanon },
      [SUBSCRIBER]: { render: statusRender("derived"), canonicalizer: statusCanon },
    },
    budget: { maxFreshTokens: 0 },
  });

  equal(reactor.budget.total, 0);
  equal(reactor.budget.spent(), 0);
  equal(reactor.budget.remaining(), 0);

  // Boot seeds only the source; its dispatch refuses (fail closed), nothing
  // propagates, and the refusal landed on the durable trail.
  const bootResults = await reactor.boot();
  equal(bootResults.find((r) => r.node === PRODUCER)?.disposition, "failed");
  equal(bootResults.find((r) => r.node === SUBSCRIBER), undefined);
  const receipt = reactor.ledger.lastReceipt(PRODUCER);
  ok(receipt);
  ok(isBudgetExhaustedReceipt(receipt!));

  // And without the option, the handle's accessor is the unlimited view.
  const unbudgeted = createReactor({
    adapters: {
      clock: createSystemClockAdapter(),
      storage: createMemoryStorageAdapter(),
      worldModel: new InMemoryWorldModelStore(),
    },
    topology: topology(),
    mounts: {
      [PRODUCER]: { render: statusRender("active"), canonicalizer: statusCanon },
      [SUBSCRIBER]: { render: statusRender("derived"), canonicalizer: statusCanon },
    },
  });
  equal(unbudgeted.budget.total, null);
  equal(unbudgeted.budget.remaining(), Infinity);
  equal(unbudgeted.budget.spent(), 0);
});
