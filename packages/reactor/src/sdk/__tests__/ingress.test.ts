// Tests for the ingress seam (§5.6 / decision #7): `Reactor.ingest(node, { data })`
// stages a payload into the node's phantom-ingress truth — moving its
// `input_fingerprints` — so the wake is a memo-MISS and the node re-renders reading
// the staged input. A re-stage of the SAME payload is idempotent (the ingress
// fingerprint is stable) → the node memo-SKIPS. A NEW payload moves it → re-render.
//
// Also proves the handle assembled WITHOUT an armed stager throws a legible error
// on `{ data }` (the `Wake` carries no payload slot, so `{ data }` REQUIRES a stager).

import { deepEqual, equal, ok, throws } from "node:assert/strict";
import { test } from "node:test";

import { createReactor } from "../create-reactor";
import { assembleReactor } from "../reactor-handle";
import { mountDag, type AsyncMountedRender } from "../mounted-dag";
import { inMemorySubstrate } from "../../adapters/substrate";
import { augmentTopologyWithIngress, armConnectors } from "../ingress";
import { createMemoryStorageAdapter } from "../../adapters/storage-memory";
import {
  files,
  jsonFile,
  textFile,
  type Canonicalizer,
} from "../../world-model";
import {
  ATOMIC_FACET,
  asFingerprint,
  asNodeId,
  type Cost,
  type WakeSource,
} from "../../shapes";
import { type ReconcilerTopology } from "../../reactor";

const SRC = "responsibility.ingress-source";

// A canonicalizer that fingerprints the node's published `out.json` body — so the
// SUBSCRIBER's own truth only moves when the render writes something new.
const outCanon: Canonicalizer = (wm) => {
  const bytes = wm["out.json"];
  const body = bytes === undefined ? "cold" : new TextDecoder().decode(bytes);
  return { [ATOMIC_FACET]: asFingerprint(`out:${body}`) };
};

function cost(surprise: WakeSource): Cost {
  return {
    provider: "test",
    model: "test-model",
    tokens: { fresh: 50, reused: 0 },
    surprise_cause: surprise,
  };
}

/** A render that echoes the count of staged ingress inputs it has been waked with. */
function countingRender(state: { renders: number }): AsyncMountedRender {
  return async (ctx) => {
    state.renders += 1;
    return {
      world_model: files({ "out.json": jsonFile({ render: state.renders }) }),
      cost: cost(ctx.wake.source),
    };
  };
}

function baseTopology(): ReconcilerTopology {
  return {
    topology: {
      nodes: [
        {
          node: asNodeId(SRC),
          contract_fingerprint: asFingerprint("c:src@1"),
          wake_source: "external",
        },
      ],
      edges: [],
      entry_points: [asNodeId(SRC)],
      acyclic: true,
    },
    contract_fingerprints: { [SRC]: asFingerprint("c:src@1") },
  };
}

test("ingest({ data }): stages the payload → memo-MISS → the node renders reading it", async () => {
  const state = { renders: 0 };
  const r = createReactor({
    substrate: inMemorySubstrate(),
    topology: augmentTopologyWithIngress(baseTopology(), [SRC]),
    asyncMounts: { [SRC]: { render: countingRender(state), canonicalizer: outCanon } },
  });

  const results = await r.ingest(SRC, { data: files({ "in.txt": textFile("hello") }) });
  const src = results.find((x) => x.node === SRC);
  equal(src?.disposition, "rendered");
  equal(state.renders, 1);
});

test("ingest({ data }): re-staging the SAME payload is idempotent → memo-SKIP (no re-render)", async () => {
  const state = { renders: 0 };
  const r = createReactor({
    substrate: inMemorySubstrate(),
    topology: augmentTopologyWithIngress(baseTopology(), [SRC]),
    asyncMounts: { [SRC]: { render: countingRender(state), canonicalizer: outCanon } },
  });

  await r.ingest(SRC, { data: files({ "in.txt": textFile("hello") }) });
  equal(state.renders, 1);

  const second = await r.ingest(SRC, { data: files({ "in.txt": textFile("hello") }) });
  equal(second.find((x) => x.node === SRC)?.disposition, "skipped");
  equal(state.renders, 1, "the same staged payload did NOT re-render");
});

test("ingest({ data }): a NEW payload moves the ingress fingerprint → re-render", async () => {
  const state = { renders: 0 };
  const r = createReactor({
    substrate: inMemorySubstrate(),
    topology: augmentTopologyWithIngress(baseTopology(), [SRC]),
    asyncMounts: { [SRC]: { render: countingRender(state), canonicalizer: outCanon } },
  });

  await r.ingest(SRC, { data: files({ "in.txt": textFile("hello") }) });
  equal(state.renders, 1);

  // A distinct file set moves the ingress atomic fingerprint → memo-MISS.
  const third = await r.ingest(SRC, { data: files({ "in2.txt": textFile("world") }) });
  equal(third.find((x) => x.node === SRC)?.disposition, "rendered");
  equal(state.renders, 2);
});

test("augmentTopologyWithIngress: adds one phantom-ingress edge, idempotently", () => {
  const once = augmentTopologyWithIngress(baseTopology(), [SRC]);
  deepEqual(once.topology.edges, [
    { subscriber: SRC, producer: `${SRC}::ingress`, facet: ATOMIC_FACET },
  ]);
  // Re-augmenting the same node does not duplicate the edge.
  const twice = augmentTopologyWithIngress(once, [SRC]);
  equal(twice.topology.edges.length, 1);
  // A name absent from the topology is ignored.
  const unknown = augmentTopologyWithIngress(baseTopology(), ["nope"]);
  equal(unknown.topology.edges.length, 0);
});

test("armConnectors: a poll fetches → extracts → stages each NEW arrival → wakes; the cursor dedups", async () => {
  const state = { renders: 0 };
  // A durable substrate over the SAME in-memory storage the cursor round-trips.
  const storage = createMemoryStorageAdapter();
  const sub = { ...inMemorySubstrate(), storage };
  const r = createReactor({
    substrate: sub,
    topology: augmentTopologyWithIngress(baseTopology(), [SRC]),
    asyncMounts: { [SRC]: { render: countingRender(state), canonicalizer: outCanon } },
  });

  let batch: unknown[] = [{ id: "a1" }, { id: "a2" }];
  const pollConnectors = armConnectors({
    connectors: [{ node: SRC, fetch: () => batch }],
    store: r.store,
    ledger: r.ledger,
    storage,
    dag: { ingestAsync: (node, wake) => r.ingest(node, wake !== undefined ? { wake } : undefined) },
    clock: r.clock,
  });

  const first = await pollConnectors("2026-06-02T00:00:00.000Z");
  deepEqual(first[0]?.ingested_ids, ["a1", "a2"], "both new arrivals ingested");
  deepEqual(first[0]?.skipped_ids, []);
  equal(state.renders, 2, "one render per new arrival");

  // Re-poll the SAME batch — both ids are past the durable cursor → no re-ingest.
  const second = await pollConnectors("2026-06-02T00:01:00.000Z");
  deepEqual(second[0]?.ingested_ids, []);
  deepEqual(second[0]?.skipped_ids, ["a1", "a2"]);
  equal(state.renders, 2, "the cursor deduped — no re-render");

  // A NEW arrival on a later poll ingests only the new id.
  batch = [{ id: "a1" }, { id: "a2" }, { id: "a3" }];
  const third = await pollConnectors("2026-06-02T00:02:00.000Z");
  deepEqual(third[0]?.ingested_ids, ["a3"]);
  equal(state.renders, 3);
});

test("ingest({ data }) without an armed stager throws a legible error", async () => {
  // Assemble a handle directly with NO `stage` — the raw mounted DAG path.
  const dag = mountDag({
    topology: baseTopology(),
    mounts: {},
    asyncMounts: { [SRC]: { render: countingRender({ renders: 0 }), canonicalizer: outCanon } },
  });
  const sub = inMemorySubstrate();
  const handle = assembleReactor({
    dag,
    clock: sub.clock,
    topology: baseTopology(),
    bootSeeds: [],
    // no `stage`
  });
  // The guard fires BEFORE the async boundary (the `Wake` has no payload slot, so
  // `{ data }` cannot be delivered) — a fail-fast throw, not a silent drop.
  throws(
    () => handle.ingest(SRC, { data: files({ "in.txt": textFile("x") }) }),
    /requires an armed ingress stager/,
  );
  // A bare `{ wake }` still works (no payload to stage).
  const ok1 = await handle.ingest(SRC);
  ok(Array.isArray(ok1));
});
