// Tests for the real polling connector + gateway driver + idempotency cursor
// (connector-poll/index.ts; gap-audit 00-INVENTORY #12; build plan Phase 4b).
// Proves: a real (injected) fetch flows through the connector; the gateway driver
// turns each NEW arrival into an external wake -> receipt at the edge; the
// idempotency cursor dedups re-polled / re-delivered arrivals so they never
// re-ingest; and the cursor round-trips a durable registry so a restart resumes
// without re-ingesting the backlog.

import { deepEqual, equal, ok, throws } from "node:assert/strict";
import { test } from "node:test";

import { ATOMIC_FACET, EMPTY_SEMANTIC_DIFF } from "../../../shapes";
import { createNullSignature } from "../../../receipt";
import {
  jsonFile,
  files,
  readTextFile,
  InMemoryWorldModelStore,
  type Canonicalizer,
} from "../../../world-model";
import { type ReconcilerTopology } from "../../../reactor";
import { mountDag, type MountedRender } from "../../../sdk/mounted-dag";
import {
  createPollConnectorAdapter,
  createIdempotencyCursor,
  loadIdempotencyCursor,
  cursorRegistryPatch,
  pollGateway,
  type GatewayArrival,
} from "../index";

// INGRESS is the system's EDGE — a PHANTOM source (not a mounted node): the
// gateway subscribes to it, and a staged arrival moves its facet directly (the
// scenario fixture's `injectExternalReceipt` pattern). The GATEWAY is the mounted
// node that reads the staged inbox by reference and folds it into its truth.
const INGRESS = "ingress.events";
const GATEWAY = "gateway.event-ledger";

// The gateway maintains the accepted-event ledger; it reads the ingress source's
// staged inbox by reference and folds it into its `count` truth.
const gatewayCanon: Canonicalizer = (wm) => {
  const parsed = JSON.parse(readTextFile(wm["g.json"] as Uint8Array));
  return { [ATOMIC_FACET]: `count:${parsed.count}` };
};

function topology(): ReconcilerTopology {
  // Only the GATEWAY is a mounted node; INGRESS is an external edge whose producer
  // is undeclared (the system's edge), so the gateway has the only contract.
  return {
    topology: {
      nodes: [
        { node: GATEWAY, contract_fingerprint: "c:gateway@1", wake_source: "external" },
      ],
      edges: [{ subscriber: GATEWAY, producer: INGRESS, facet: ATOMIC_FACET }],
      entry_points: [GATEWAY],
      acyclic: true,
    },
    contract_fingerprints: { [GATEWAY]: "c:gateway@1" },
  };
}

function cost(source: "input" | "self" | "external") {
  return { provider: "fake", model: "fake", tokens: { fresh: 1, reused: 0 }, surprise_cause: source };
}

const ingressCanon: Canonicalizer = (wm) => {
  const parsed = JSON.parse(readTextFile(wm["inbox.json"] as Uint8Array));
  return { [ATOMIC_FACET]: `inbox:${parsed.length}` };
};

// The gateway render: read the ingress inbox by reference, count the events.
function gatewayRender(store: InMemoryWorldModelStore): MountedRender {
  return (ctx) => {
    const read = store.read(INGRESS, "published");
    const inboxBytes = read.files["inbox.json"];
    const inbox = inboxBytes === undefined ? [] : JSON.parse(readTextFile(inboxBytes));
    return { world_model: files({ "g.json": jsonFile({ count: inbox.length }) }), cost: cost(ctx.wake.source) };
  };
}

/**
 * Build the mounted DAG + a `stage` that commits the arrival into the PHANTOM
 * ingress source's published truth and appends an external receipt directly —
 * moving the gateway's input fingerprint — exactly as the scenario fixture's
 * `injectExternalReceipt` does before waking the gateway. (A pure source node
 * memo-skips on a bare self/external re-wake — its memo key never moves — so the
 * edge's evidence has to be staged into the upstream truth, not re-rendered.)
 */
function harness() {
  const store = new InMemoryWorldModelStore();
  const inbox: unknown[] = [];
  const dag = mountDag({
    topology: topology(),
    mounts: {
      [GATEWAY]: { render: gatewayRender(store), canonicalizer: gatewayCanon },
    },
    store,
  });
  const stage = (arrival: GatewayArrival) => {
    inbox.push(arrival.item);
    const commit = store.commitPublished(
      INGRESS,
      files({ "inbox.json": jsonFile(inbox) }),
      ingressCanon,
    );
    const prev = dag.ledger.lastReceipt(INGRESS);
    dag.ledger.append({
      node: INGRESS,
      contract_fingerprint: "c:ingress@edge",
      wake: { source: "external", refs: [] },
      input_fingerprints: [],
      fingerprints: commit.fingerprints,
      semantic_diff: EMPTY_SEMANTIC_DIFF,
      prev: prev !== null ? dag.ledger.addressOf(prev) : null,
      status: "rendered",
      cost: cost("external"),
      sig: createNullSignature(),
    });
  };
  return { dag, store, inbox, stage };
}

const extractEvents = (payload: unknown): readonly GatewayArrival[] => {
  const list = payload as ReadonlyArray<{ id: string; kind: string }>;
  return list.map((e) => ({ id: e.id, item: e }));
};

test("the poll connector performs the injected fetch and clones in/out", () => {
  const connector = createPollConnectorAdapter((req) => {
    equal(req.source_id, "src.alpha");
    return [{ id: "e1", kind: "click" }];
  });
  const res = connector.read({ source_id: "src.alpha" });
  deepEqual(res.payload, [{ id: "e1", kind: "click" }]);
  deepEqual(connector.reads().map((r) => r.source_id), ["src.alpha"]);
});

test("pollGateway ingests each NEW arrival once; re-polling the same items is a no-op (idempotency cursor)", () => {
  const { dag, stage } = harness();
  const cursor = createIdempotencyCursor();

  // Source returns e1, e2 on the first poll.
  let batch: Array<{ id: string; kind: string }> = [
    { id: "e1", kind: "click" },
    { id: "e2", kind: "view" },
  ];
  const connector = createPollConnectorAdapter(() => batch);

  const first = pollGateway(dag, {
    connector,
    source_id: "src.alpha",
    node: GATEWAY,
    extract: extractEvents,
    cursor,
    stage,
  });
  deepEqual(first.ingested_ids, ["e1", "e2"]);
  deepEqual(first.skipped_ids, []);
  equal(cursor.count("src.alpha"), 2);
  // The gateway's truth folded both staged events.
  const gw = JSON.parse(readTextFile(dag.store.read(GATEWAY, "published").files["g.json"] as Uint8Array));
  equal(gw.count, 2);

  // Re-poll the SAME batch (a redundant cron tick / at-least-once redelivery):
  // both are past the cursor, so NOTHING re-ingests.
  const second = pollGateway(dag, {
    connector,
    source_id: "src.alpha",
    node: GATEWAY,
    extract: extractEvents,
    cursor,
    stage,
  });
  deepEqual(second.ingested_ids, []);
  deepEqual(second.skipped_ids, ["e1", "e2"]);
  equal(cursor.count("src.alpha"), 2);

  // A poll with one NEW arrival (e3) ingests only e3.
  batch = [
    { id: "e1", kind: "click" },
    { id: "e2", kind: "view" },
    { id: "e3", kind: "buy" },
  ];
  const third = pollGateway(dag, {
    connector,
    source_id: "src.alpha",
    node: GATEWAY,
    extract: extractEvents,
    cursor,
    stage,
  });
  deepEqual(third.ingested_ids, ["e3"]);
  deepEqual(third.skipped_ids, ["e1", "e2"]);
  const gw2 = JSON.parse(readTextFile(dag.store.read(GATEWAY, "published").files["g.json"] as Uint8Array));
  equal(gw2.count, 3);
});

test("the cursor round-trips a durable registry — a restart resumes without re-ingesting the backlog", () => {
  const cursor = createIdempotencyCursor();
  cursor.mark("src.alpha", "e1");
  cursor.mark("src.alpha", "e2");

  // Persist + rehydrate (simulating a process restart over the storage registry).
  const registry = { ...cursorRegistryPatch(cursor) };
  deepEqual(registry.gateway_cursors, { "src.alpha": ["e1", "e2"] });
  const restored = loadIdempotencyCursor(registry);

  // The restored cursor knows the backlog — a re-poll of e1/e2 skips both.
  const { dag, stage } = harness();
  const connector = createPollConnectorAdapter(() => [
    { id: "e1", kind: "click" },
    { id: "e2", kind: "view" },
    { id: "e3", kind: "buy" },
  ]);
  const result = pollGateway(dag, {
    connector,
    source_id: "src.alpha",
    node: GATEWAY,
    extract: extractEvents,
    cursor: restored,
    stage,
  });
  deepEqual(result.ingested_ids, ["e3"]);
  deepEqual(result.skipped_ids, ["e1", "e2"]);
});

test("a duplicate idempotency id within one poll throws (a source bug the cursor cannot disambiguate)", () => {
  const { dag, stage } = harness();
  const cursor = createIdempotencyCursor();
  const connector = createPollConnectorAdapter(() => [
    { id: "e1", kind: "click" },
    { id: "e1", kind: "click" },
  ]);
  throws(
    () =>
      pollGateway(dag, {
        connector,
        source_id: "src.alpha",
        node: GATEWAY,
        extract: extractEvents,
        cursor,
        stage,
      }),
    /duplicated within one poll/,
  );
});

test("an empty idempotency id throws", () => {
  const { dag, stage } = harness();
  const cursor = createIdempotencyCursor();
  const connector = createPollConnectorAdapter(() => [{ id: "", kind: "x" }]);
  throws(
    () =>
      pollGateway(dag, {
        connector,
        source_id: "src.alpha",
        node: GATEWAY,
        extract: extractEvents,
        cursor,
        stage,
      }),
    /empty idempotency id/,
  );
});

test("loadIdempotencyCursor rejects a malformed persisted snapshot", () => {
  throws(() => loadIdempotencyCursor({ gateway_cursors: { "src.alpha": [1, 2] } }), /non-empty strings/);
  throws(() => loadIdempotencyCursor({ gateway_cursors: 42 }), /must be an object/);
});

test("snapshot is canonical (sorted sources + ids) so the durable blob is byte-stable", () => {
  const cursor = createIdempotencyCursor();
  cursor.mark("src.beta", "z");
  cursor.mark("src.alpha", "b");
  cursor.mark("src.alpha", "a");
  deepEqual(cursor.snapshot(), { "src.alpha": ["a", "b"], "src.beta": ["z"] });
});
