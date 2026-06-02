// Tests for the keystone assembler (create-reactor.ts) — `createReactor` wiring
// the durable FS world-model store + persisted ledger + clock + render bodies
// into the run-phase surface, and the BOOT / COLD-MISS SWEEP that survives a
// restart (architecture.md §5.3 + §8; gap-audit 00-INVENTORY #9/#10).

import { deepEqual, equal, ok } from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { ATOMIC_FACET } from "../../shapes";
import {
  jsonFile,
  files,
  readTextFile,
  type Canonicalizer,
} from "../../world-model";
import { FileSystemWorldModelStore } from "../../world-model/fs-store";
import { createFileSystemStorageAdapter } from "../../adapters/storage-fs";
import { createSystemClockAdapter } from "../../adapters/clock-system";
import { type ReconcilerTopology } from "../../reactor";
import { createReactor } from "../create-reactor";
import { type MountedRender } from "../mounted-dag";

const PRODUCER = "responsibility.vendor-truth";
const SUBSCRIBER = "responsibility.renewal-watch";

// Fingerprint only the material `status` so "moved vs unmoved" is deterministic.
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

function cost(source: "input" | "self" | "external") {
  return {
    provider: "fake",
    model: "fake",
    tokens: { fresh: 1, reused: 0 },
    surprise_cause: source,
  };
}

// A render that counts how many times it actually ran (proves boot memo-skip).
function countingProducer(status: () => string, calls: { n: number }): MountedRender {
  return (ctx) => {
    calls.n += 1;
    return { world_model: files({ "t.json": jsonFile({ status: status() }) }), cost: cost(ctx.wake.source) };
  };
}

function subscriber(calls: { n: number }): MountedRender {
  return (ctx) => {
    calls.n += 1;
    return {
      world_model: files({ "t.json": jsonFile({ status: "derived", saw: ctx.input_fingerprints }) }),
      cost: cost(ctx.wake.source),
    };
  };
}

function dirs(): { wm: string; storage: string } {
  return {
    wm: mkdtempSync(join(tmpdir(), "opreactor-wm-")),
    storage: mkdtempSync(join(tmpdir(), "opreactor-st-")),
  };
}

test("boot cold-miss sweep renders the source AND propagates to the subscriber", () => {
  const d = dirs();
  try {
    const pCalls = { n: 0 };
    const sCalls = { n: 0 };
    const reactor = createReactor({
      adapters: {
        clock: createSystemClockAdapter(),
        storage: createFileSystemStorageAdapter({ directory: d.storage }),
        worldModel: new FileSystemWorldModelStore({ directory: d.wm }),
      },
      topology: topology(),
      mounts: {
        [PRODUCER]: { render: countingProducer(() => "active", pCalls), canonicalizer: statusCanon },
        [SUBSCRIBER]: { render: subscriber(sCalls), canonicalizer: statusCanon },
      },
    });

    const results = reactor.sync.boot();

    const producer = results.find((r) => r.node === PRODUCER);
    const sub = results.find((r) => r.node === SUBSCRIBER);
    equal(producer?.disposition, "rendered");
    equal(sub?.disposition, "rendered");
    equal(pCalls.n, 1);
    equal(sCalls.n, 1);
    // The subscriber consumed the producer's published atomic fingerprint.
    deepEqual(sub?.receipt?.input_fingerprints, ["status:active"]);

    // The durable substrates hold the committed truth + the receipt trail.
    deepEqual(reactor.store.publishedFingerprints(PRODUCER), { [ATOMIC_FACET]: "status:active" });
    ok(reactor.ledger.all().length >= 2);
  } finally {
    rmSync(d.wm, { recursive: true, force: true });
    rmSync(d.storage, { recursive: true, force: true });
  }
});

test("RESTART-SURVIVAL: a second reactor over the same dirs boots to all-skips (no re-render)", () => {
  const d = dirs();
  try {
    // --- process 1: boot once, committing truth + receipts to disk.
    const p1 = { n: 0 };
    const s1 = { n: 0 };
    const first = createReactor({
      adapters: {
        clock: createSystemClockAdapter(),
        storage: createFileSystemStorageAdapter({ directory: d.storage }),
        worldModel: new FileSystemWorldModelStore({ directory: d.wm }),
      },
      topology: topology(),
      mounts: {
        [PRODUCER]: { render: countingProducer(() => "active", p1), canonicalizer: statusCanon },
        [SUBSCRIBER]: { render: subscriber(s1), canonicalizer: statusCanon },
      },
    });
    first.sync.boot();
    equal(p1.n, 1);
    equal(s1.n, 1);
    const producerFpBefore = first.store.publishedFingerprints(PRODUCER);
    const receiptsBefore = first.ledger.all().length;

    // --- process 2: a BRAND NEW reactor (new storage adapter + new world-model
    // store) over the SAME directories. The durable ledger re-derives every
    // node's last receipt, so the boot sweep memo-SKIPS — nothing re-renders.
    const p2 = { n: 0 };
    const s2 = { n: 0 };
    const second = createReactor({
      adapters: {
        clock: createSystemClockAdapter(),
        storage: createFileSystemStorageAdapter({ directory: d.storage }),
        worldModel: new FileSystemWorldModelStore({ directory: d.wm }),
      },
      topology: topology(),
      mounts: {
        [PRODUCER]: { render: countingProducer(() => "active", p2), canonicalizer: statusCanon },
        [SUBSCRIBER]: { render: subscriber(s2), canonicalizer: statusCanon },
      },
    });

    const bootResults = second.sync.boot();

    // NEITHER render body ran on the restart boot — "cost scales with surprise,
    // not the restart" (architecture.md §4.1; §8).
    equal(p2.n, 0);
    equal(s2.n, 0);
    // The producer's boot result is a skip; the subscriber never even woke
    // (a skip propagates nothing).
    const producer = bootResults.find((r) => r.node === PRODUCER);
    equal(producer?.disposition, "skipped");
    equal(bootResults.find((r) => r.node === SUBSCRIBER), undefined);

    // The committed truth survived intact (the restart re-opened the prior
    // memory, not a fresh one). The trail GREW by exactly one — the source's
    // cheap `skipped` receipt (a skip writes a receipt but commits no new truth);
    // the subscriber never woke, so it appended nothing.
    deepEqual(second.store.publishedFingerprints(PRODUCER), producerFpBefore);
    equal(second.ledger.all().length, receiptsBefore + 1);
  } finally {
    rmSync(d.wm, { recursive: true, force: true });
    rmSync(d.storage, { recursive: true, force: true });
  }
});

test("RESTART after an EDITED source contract re-renders the moved node + propagates", () => {
  // A pure source node (no inbound edges, unchanged contract) memo-SKIPS on a
  // restart REGARDLESS of what its render would now output — memo is on
  // `(contract_fp, input_fp)`, never on the node's own output (that is the whole
  // point: "cost scales with surprise, not the restart"). The honest way a
  // source re-renders on a restart is a CONTRACT-SET change — schema migration is
  // "just a forced render" (architecture.md §8 L386–L389): bump the producer's
  // contract fingerprint and its memo key moves.
  const d = dirs();
  try {
    // process 1: boot the producer under contract `@1` → "active".
    const first = createReactor({
      adapters: {
        clock: createSystemClockAdapter(),
        storage: createFileSystemStorageAdapter({ directory: d.storage }),
        worldModel: new FileSystemWorldModelStore({ directory: d.wm }),
      },
      topology: topology(),
      mounts: {
        [PRODUCER]: { render: countingProducer(() => "active", { n: 0 }), canonicalizer: statusCanon },
        [SUBSCRIBER]: { render: subscriber({ n: 0 }), canonicalizer: statusCanon },
      },
    });
    first.sync.boot();

    // process 2: same dirs, but the producer's contract was EDITED to `@2` and
    // it now renders "churned". The bumped contract fingerprint moves the
    // producer's memo key → it re-renders, its atomic fingerprint MOVES, and the
    // subscriber wakes + re-renders. The subscriber's own contract is unchanged.
    const editedTopo = topology();
    const editedProducerTopo: ReconcilerTopology = {
      topology: {
        ...editedTopo.topology,
        nodes: editedTopo.topology.nodes.map((n) =>
          n.node === PRODUCER ? { ...n, contract_fingerprint: "c:producer@2" } : n,
        ),
      },
      contract_fingerprints: { ...editedTopo.contract_fingerprints, [PRODUCER]: "c:producer@2" },
    };
    const p2 = { n: 0 };
    const s2 = { n: 0 };
    const second = createReactor({
      adapters: {
        clock: createSystemClockAdapter(),
        storage: createFileSystemStorageAdapter({ directory: d.storage }),
        worldModel: new FileSystemWorldModelStore({ directory: d.wm }),
      },
      topology: editedProducerTopo,
      mounts: {
        [PRODUCER]: { render: countingProducer(() => "churned", p2), canonicalizer: statusCanon },
        [SUBSCRIBER]: { render: subscriber(s2), canonicalizer: statusCanon },
      },
    });
    const bootResults = second.sync.boot();

    const producer = bootResults.find((r) => r.node === PRODUCER);
    const sub = bootResults.find((r) => r.node === SUBSCRIBER);
    equal(producer?.disposition, "rendered");
    equal(sub?.disposition, "rendered");
    equal(p2.n, 1);
    equal(s2.n, 1);
    deepEqual(second.store.publishedFingerprints(PRODUCER), { [ATOMIC_FACET]: "status:churned" });
    deepEqual(sub?.receipt?.input_fingerprints, ["status:churned"]);
  } finally {
    rmSync(d.wm, { recursive: true, force: true });
    rmSync(d.storage, { recursive: true, force: true });
  }
});

test("createReactor defaults the world-model store to a FileSystemWorldModelStore over `directory`", () => {
  const d = dirs();
  try {
    const reactor = createReactor({
      adapters: {
        clock: createSystemClockAdapter(),
        storage: createFileSystemStorageAdapter({ directory: d.storage }),
      },
      directory: d.wm,
      topology: topology(),
      mounts: {
        [PRODUCER]: { render: countingProducer(() => "active", { n: 0 }), canonicalizer: statusCanon },
        [SUBSCRIBER]: { render: subscriber({ n: 0 }), canonicalizer: statusCanon },
      },
    });
    ok(reactor.store instanceof FileSystemWorldModelStore);
    const results = reactor.sync.boot();
    equal(results.find((r) => r.node === PRODUCER)?.disposition, "rendered");
  } finally {
    rmSync(d.wm, { recursive: true, force: true });
    rmSync(d.storage, { recursive: true, force: true });
  }
});

test("boot() drives the same cold-miss sweep through the async path", async () => {
  const d = dirs();
  try {
    const p = { n: 0 };
    const reactor = createReactor({
      adapters: {
        clock: createSystemClockAdapter(),
        storage: createFileSystemStorageAdapter({ directory: d.storage }),
        worldModel: new FileSystemWorldModelStore({ directory: d.wm }),
      },
      topology: topology(),
      // Mount the producer on the ASYNC path (a sync render wrapped); the
      // subscriber falls back to the sync mount.
      asyncMounts: {
        [PRODUCER]: {
          render: async (ctx) => {
            p.n += 1;
            return { world_model: files({ "t.json": jsonFile({ status: "active" }) }), cost: cost(ctx.wake.source) };
          },
          canonicalizer: statusCanon,
        },
      },
      mounts: {
        [SUBSCRIBER]: { render: subscriber({ n: 0 }), canonicalizer: statusCanon },
      },
    });

    const results = await reactor.boot();
    equal(results.find((r) => r.node === PRODUCER)?.disposition, "rendered");
    equal(results.find((r) => r.node === SUBSCRIBER)?.disposition, "rendered");
    equal(p.n, 1);
  } finally {
    rmSync(d.wm, { recursive: true, force: true });
    rmSync(d.storage, { recursive: true, force: true });
  }
});
