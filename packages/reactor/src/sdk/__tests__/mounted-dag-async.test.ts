// Tests for the ASYNC mounted-DAG surface (Phase-1 live execution).
//
// Proves `ingestAsync`/`tickAsync`/`drainAsync` over `asyncMounts` mirror the
// sync `ingest`/`tick`/`drain` semantics — cold-miss render, propagation by
// topology edge, memo skip — but await an `AsyncMountedRender` (a bounded LLM
// session, 05 §1.1, §2.1). Also proves the async spawn falls back to the sync
// `mounts` render when no `asyncMounts` entry exists (additive subsumption).

import { deepEqual, equal } from "node:assert/strict";
import { test } from "node:test";

import {
  mountDag,
  type AsyncMountedRender,
  type MountedRender,
} from "../mounted-dag";
import {
  jsonFile,
  files,
  readTextFile,
  type Canonicalizer,
} from "../../world-model";
import { ATOMIC_FACET, FAILURE_REASON_DIFF_KEY, type Cost, type WakeSource, asFingerprint, asNodeId} from "../../shapes";
import { type ReconcilerTopology } from "../../reactor";

const PRODUCER = "responsibility.vendor-truth";
const SUBSCRIBER = "responsibility.renewal-watch";

const statusCanon: Canonicalizer = (wm) => {
  const parsed = JSON.parse(readTextFile(wm["t.json"] as Uint8Array));
  return { [ATOMIC_FACET]: asFingerprint(`status:${parsed.status}`) };
};

function cost(surprise: WakeSource): Cost {
  return {
    provider: "test",
    model: "test-model",
    tokens: { fresh: 50, reused: 0 },
    surprise_cause: surprise,
  };
}

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

function asyncProducerRender(status: string): AsyncMountedRender {
  return async (ctx) => {
    // A real await to prove the path is genuinely asynchronous.
    await Promise.resolve();
    return {
      world_model: files({ "t.json": jsonFile({ status }) }),
      cost: cost(ctx.wake.source),
    };
  };
}

const asyncSubscriberRender: AsyncMountedRender = async (ctx) => {
  await Promise.resolve();
  return {
    world_model: files({
      "t.json": jsonFile({ status: "derived", saw: ctx.input_fingerprints }),
    }),
    cost: cost(ctx.wake.source),
  };
};

test("ingestAsync: a producer wake renders it AND propagates to the subscriber", async () => {
  const dag = mountDag({
    topology: topology(),
    mounts: {},
    asyncMounts: {
      [PRODUCER]: { render: asyncProducerRender("active"), canonicalizer: statusCanon },
      [SUBSCRIBER]: { render: asyncSubscriberRender, canonicalizer: statusCanon },
    },
  });

  const results = await dag.ingestAsync(PRODUCER);

  const producer = results.find((r) => r.node === PRODUCER);
  const subscriber = results.find((r) => r.node === SUBSCRIBER);
  equal(producer?.disposition, "rendered");
  equal(subscriber?.disposition, "rendered");
  deepEqual(subscriber?.receipt?.input_fingerprints, ["status:active"]);
});

test("ingestAsync: re-ingesting an unmoved producer SKIPS — no second render, no subscriber re-render", async () => {
  const dag = mountDag({
    topology: topology(),
    mounts: {},
    asyncMounts: {
      [PRODUCER]: { render: asyncProducerRender("active"), canonicalizer: statusCanon },
      [SUBSCRIBER]: { render: asyncSubscriberRender, canonicalizer: statusCanon },
    },
  });

  await dag.ingestAsync(PRODUCER); // cold-miss render + propagate
  const second = await dag.ingestAsync(PRODUCER); // inputs unmoved → skip

  const producer = second.find((r) => r.node === PRODUCER);
  equal(producer?.disposition, "skipped");
  equal(second.find((r) => r.node === SUBSCRIBER), undefined);
});

test("ingestAsync: an async render that throws degrades to a failed receipt (prior truth stands)", async () => {
  const dag = mountDag({
    topology: {
      topology: {
        nodes: [{ node: asNodeId("n"), contract_fingerprint: asFingerprint("c@1"), wake_source: "external" }],
        edges: [],
        entry_points: [asNodeId("n")],
        acyclic: true,
      },
      contract_fingerprints: { n: asFingerprint("c@1") },
    },
    mounts: {},
    asyncMounts: {
      n: {
        render: async () => {
          throw new Error("session blew up");
        },
      },
    },
  });

  const results = await dag.ingestAsync("n");
  equal(results[0]?.disposition, "failed");
  equal(results[0]?.receipt?.status, "failed");
  // The thrown message becomes the persisted failure reason.
  equal(results[0]?.reason, "session blew up");
  equal(results[0]?.receipt?.semantic_diff[FAILURE_REASON_DIFF_KEY], "session blew up");
});

test("ingestAsync: falls back to the SYNC mounts render when no async mount exists (additive subsumption)", async () => {
  const syncRender: MountedRender = (ctx) => ({
    world_model: files({ "t.json": jsonFile({ status: "sync-rendered" }) }),
    cost: cost(ctx.wake.source),
  });
  const dag = mountDag({
    topology: {
      topology: {
        nodes: [{ node: asNodeId("n"), contract_fingerprint: asFingerprint("c@1"), wake_source: "external" }],
        edges: [],
        entry_points: [asNodeId("n")],
        acyclic: true,
      },
      contract_fingerprints: { n: asFingerprint("c@1") },
    },
    mounts: { n: { render: syncRender, canonicalizer: statusCanon } },
    // no asyncMounts — the async spawn wraps the sync render
  });

  const results = await dag.ingestAsync("n");
  equal(results[0]?.disposition, "rendered");
  deepEqual(results[0]?.receipt?.fingerprints, { [ATOMIC_FACET]: asFingerprint("status:sync-rendered") });
});

test("tickAsync: a self-sourced wake drives the async path", async () => {
  const dag = mountDag({
    topology: {
      topology: {
        nodes: [{ node: asNodeId("n"), contract_fingerprint: asFingerprint("c@1"), wake_source: "self" }],
        edges: [],
        entry_points: [asNodeId("n")],
        acyclic: true,
      },
      contract_fingerprints: { n: asFingerprint("c@1") },
    },
    mounts: {},
    asyncMounts: {
      n: {
        render: async (ctx) => ({
          world_model: files({ "t.json": jsonFile({ status: "ticked" }) }),
          cost: cost(ctx.wake.source),
        }),
        canonicalizer: statusCanon,
      },
    },
  });

  const results = await dag.tickAsync("n");
  equal(results[0]?.disposition, "rendered");
  equal(results[0]?.receipt?.wake.source, "self");
});
