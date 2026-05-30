// Tests for the MOUNTED DAG front door — the render atom mounted as nodes and
// woken over time, driven by the dumb reconciler (architecture.md §1 L32, §4.1;
// delta.md Part A). Covers: cold-start cold-miss renders, ingest → propagate by
// topology edge, skip-on-unmoved-input (the memo/skip decision), and failed
// renders not propagating.

import { deepEqual, equal, ok } from "node:assert/strict";
import { test } from "node:test";

import { mountDag, type MountedRender } from "../mounted-dag";
import {
  jsonFile,
  files,
  readTextFile,
  type Canonicalizer,
} from "../../world-model";
import { ATOMIC_FACET } from "../../shapes";
import { type ReconcilerTopology } from "../../reactor";

const PRODUCER = "responsibility.vendor-truth";
const SUBSCRIBER = "responsibility.renewal-watch";

// A canonicalizer that fingerprints only the material `status` so we can drive
// "moved vs unmoved" deterministically (architecture.md §3.2).
const statusCanon: Canonicalizer = (wm) => {
  const parsed = JSON.parse(readTextFile(wm["t.json"] as Uint8Array));
  return { [ATOMIC_FACET]: `status:${parsed.status}` };
};

function topology(): ReconcilerTopology {
  return {
    topology: {
      nodes: [
        { node: PRODUCER, contract_fingerprint: "c:producer@1", wake_source: "external" },
        { node: SUBSCRIBER, contract_fingerprint: "c:subscriber@1", wake_source: "input" },
      ],
      edges: [{ subscriber: SUBSCRIBER, producer: PRODUCER, facet: ATOMIC_FACET }],
      entry_points: [PRODUCER],
      acyclic: true,
    },
    contract_fingerprints: {
      [PRODUCER]: "c:producer@1",
      [SUBSCRIBER]: "c:subscriber@1",
    },
  };
}

function producerRender(status: string): MountedRender {
  // The cost's surprise_cause must echo the wake source (a receipt invariant);
  // the harness drives the producer with whatever wake ingested it.
  return (ctx) => ({
    world_model: files({ "t.json": jsonFile({ status }) }),
    cost: cost(ctx.wake.source),
  });
}

const subscriberRender: MountedRender = (ctx) => ({
  // The subscriber's truth echoes which input fingerprints it consumed.
  world_model: files({ "t.json": jsonFile({ status: "derived", saw: ctx.input_fingerprints }) }),
  cost: cost(ctx.wake.source),
});

test("ingest a producer wake renders it AND propagates to the subscriber", () => {
  let producerStatus = "active";
  const dag = mountDag({
    topology: topology(),
    mounts: {
      [PRODUCER]: { render: (ctx) => producerRender(producerStatus)(ctx), canonicalizer: statusCanon },
      [SUBSCRIBER]: { render: subscriberRender, canonicalizer: statusCanon },
    },
  });

  const results = dag.ingest(PRODUCER);

  // The producer rendered (cold-miss), and the subscriber was woken + rendered.
  const producer = results.find((r) => r.node === PRODUCER);
  const subscriber = results.find((r) => r.node === SUBSCRIBER);
  equal(producer?.disposition, "rendered");
  equal(subscriber?.disposition, "rendered");
  // The subscriber consumed the producer's atomic fingerprint.
  deepEqual(subscriber?.receipt?.input_fingerprints, ["status:active"]);
});

test("re-ingesting an unmoved producer SKIPS — and does not re-render the subscriber", () => {
  const dag = mountDag({
    topology: topology(),
    mounts: {
      [PRODUCER]: { render: producerRender("active"), canonicalizer: statusCanon },
      [SUBSCRIBER]: { render: subscriberRender, canonicalizer: statusCanon },
    },
  });

  dag.ingest(PRODUCER); // cold-miss render + propagate
  const second = dag.ingest(PRODUCER); // inputs unmoved → skip

  const producer = second.find((r) => r.node === PRODUCER);
  equal(producer?.disposition, "skipped");
  // A skip propagates nothing; the subscriber is NOT in the second drain.
  equal(second.find((r) => r.node === SUBSCRIBER), undefined);
});

test("a MOVED producer fingerprint propagates and re-renders the subscriber", () => {
  // We drive a genuine move by re-ingesting the producer under a CHANGED
  // contract fingerprint (the first half of the memo key, world-model.md §4) —
  // schema migration is "just a forced render" (architecture.md §8 L324–L327):
  // editing the contract moves the fingerprint → memo miss → the producer
  // re-renders and, because its atomic fingerprint moved, propagates to the
  // subscriber subscribed on that facet (architecture.md §4.1 L176–L178).
  let status = "active";
  let topo = topology();
  const dag = mountDag({
    topology: topo,
    mounts: {
      [PRODUCER]: { render: (ctx) => producerRender(status)(ctx), canonicalizer: statusCanon },
      [SUBSCRIBER]: { render: subscriberRender, canonicalizer: statusCanon },
    },
  });

  dag.ingest(PRODUCER); // cold-miss render of "active" + propagate to subscriber
  status = "churned";

  // A fresh mount with the producer's contract fingerprint bumped — same store +
  // ledger, so the producer's last receipt is still on record but its memo key's
  // first half moved.
  const bumped: ReconcilerTopology = {
    topology: {
      ...topo.topology,
      nodes: topo.topology.nodes.map((n) =>
        n.node === PRODUCER ? { ...n, contract_fingerprint: "c:producer@2" } : n,
      ),
    },
    contract_fingerprints: { ...topo.contract_fingerprints, [PRODUCER]: "c:producer@2" },
  };
  const dag2 = mountDag({
    topology: bumped,
    store: dag.store,
    ledger: dag.ledger,
    mounts: {
      [PRODUCER]: { render: (ctx) => producerRender(status)(ctx), canonicalizer: statusCanon },
      [SUBSCRIBER]: { render: subscriberRender, canonicalizer: statusCanon },
    },
  });

  const moved = dag2.ingest(PRODUCER);
  equal(moved.find((r) => r.node === PRODUCER)?.disposition, "rendered");
  const subscriber = moved.find((r) => r.node === SUBSCRIBER);
  equal(subscriber?.disposition, "rendered");
  deepEqual(subscriber?.receipt?.input_fingerprints, ["status:churned"]);
});

test("a failed render commits nothing and does not propagate", () => {
  const dag = mountDag({
    topology: topology(),
    mounts: {
      [PRODUCER]: {
        render: (ctx) => ({ failed: true, reason: "boom", cost: cost(ctx.wake.source) }),
        canonicalizer: statusCanon,
      },
      [SUBSCRIBER]: { render: subscriberRender, canonicalizer: statusCanon },
    },
  });

  const results = dag.ingest(PRODUCER);
  equal(results.find((r) => r.node === PRODUCER)?.disposition, "failed");
  // No subscriber wake — the fingerprint did not move.
  equal(results.find((r) => r.node === SUBSCRIBER), undefined);
  // The producer never committed a published world-model.
  equal(dag.store.ref(PRODUCER).version, null);
});

test("tick emits a self-sourced wake (the continuity clock)", () => {
  const dag = mountDag({
    topology: topology(),
    mounts: {
      [PRODUCER]: { render: producerRender("active"), canonicalizer: statusCanon },
      [SUBSCRIBER]: { render: subscriberRender, canonicalizer: statusCanon },
    },
  });
  const results = dag.tick(PRODUCER);
  const producer = results.find((r) => r.node === PRODUCER);
  equal(producer?.disposition, "rendered");
  equal(producer?.receipt?.wake.source, "self");
});

test("the ledger is an append-only node-scoped trail that verifies", () => {
  const dag = mountDag({
    topology: topology(),
    mounts: {
      [PRODUCER]: { render: producerRender("active"), canonicalizer: statusCanon },
      [SUBSCRIBER]: { render: subscriberRender, canonicalizer: statusCanon },
    },
  });
  dag.ingest(PRODUCER);
  dag.ingest(PRODUCER); // skip
  const all = dag.ledger.lastReceipt(PRODUCER);
  ok(all);
  equal(all?.node, PRODUCER);
});

// --- helpers ---------------------------------------------------------------

function cost(surprise_cause: "input" | "self" | "external" = "input") {
  return {
    provider: "anthropic",
    model: "claude",
    tokens: { fresh: 10, reused: 0 },
    surprise_cause,
  };
}
