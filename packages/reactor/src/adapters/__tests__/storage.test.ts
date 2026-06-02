import { deepEqual, equal, ok, throws } from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  ATOMIC_FACET,
  EMPTY_SEMANTIC_DIFF,
  createNullSignature,
  type Receipt, asFingerprint, asNodeId} from "../../shapes";
import { renderAdapterJson } from "../json";
import { createFileSystemStorageAdapter } from "../storage-fs";
import { createMemoryStorageAdapter } from "../storage-memory";
import type { ReactorRuntimeRegistrySnapshot } from "../types";

const CONTRACT_FP =
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const ATOMIC_FP =
  "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

test("memory storage round-trips the shrunk registry and appends ideal receipts", () => {
  const first = makeReceipt("rendered");
  const second = makeReceipt("skipped");
  const storage = createMemoryStorageAdapter({
    registry: makeRegistry("topology-1"),
    receipts: [first],
  });

  deepEqual(storage.readRegistry(), makeRegistry("topology-1"));

  const hydrated = makeRegistry("topology-2");
  storage.writeRegistry(hydrated);
  storage.appendReceipt(second);

  deepEqual(storage.readRegistry(), hydrated);
  deepEqual(storage.listReceipts(), [first, second]);

  // The reader returns a clone — mutating it must not corrupt stored truth.
  const returnedRegistry = storage.readRegistry() as Record<string, unknown>;
  returnedRegistry["topology"] = "tampered";
  deepEqual(storage.readRegistry(), hydrated);
});

test("memory storage rejects a non-object registry", () => {
  throws(
    () =>
      createMemoryStorageAdapter({
        registry: [] as unknown as ReactorRuntimeRegistrySnapshot,
      }),
    /registry snapshot must be an object/,
  );
});

test("filesystem storage round-trips deterministic JSON and survives reopen", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "reactor-adapters-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  const first = makeReceipt("rendered");
  const second = makeReceipt("rendered");
  const hydrated = makeRegistry("topology-2");
  const storage = createFileSystemStorageAdapter({
    directory,
    initial_registry: makeRegistry("topology-1"),
  });

  storage.appendReceipt(first);
  storage.writeRegistry(hydrated);
  storage.appendReceipt(second);

  const reopened = createFileSystemStorageAdapter({ directory });

  deepEqual(reopened.readRegistry(), hydrated);
  deepEqual(reopened.listReceipts(), [first, second]);
  equal(
    readFileSync(join(directory, "registry.json"), "utf8"),
    `${renderAdapterJson(hydrated)}\n`,
  );
  equal(
    readFileSync(join(directory, "receipts.json"), "utf8"),
    `${renderAdapterJson([first, second])}\n`,
  );
});

test("read-only filesystem storage NEVER creates the dir or seeds files (B5)", () => {
  // An absent target: a read-only open must leave it absent (no mkdir, no seed).
  const base = mkdtempSync(join(tmpdir(), "reactor-ro-"));
  const absent = join(base, "does-not-exist");
  try {
    const storage = createFileSystemStorageAdapter({
      directory: absent,
      read_only: true,
    });

    // Construction touched nothing.
    equal(existsSync(absent), false);

    // Reads of an absent trail are the legitimate empty case, not a create.
    deepEqual(storage.listReceipts(), []);
    deepEqual(storage.readRegistry(), {});
    equal(existsSync(absent), false);
    equal(existsSync(join(absent, "receipts.json")), false);
    equal(existsSync(join(absent, "registry.json")), false);

    // Write paths refuse on a read-only adapter.
    throws(() => storage.writeRegistry({}), /read-only/);
    throws(() => storage.appendReceipt(makeReceipt("rendered")), /read-only/);
    equal(existsSync(absent), false);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("read-only filesystem storage reads an EXISTING trail without mutating it", () => {
  const directory = mkdtempSync(join(tmpdir(), "reactor-ro-existing-"));
  try {
    const first = makeReceipt("rendered");
    const writer = createFileSystemStorageAdapter({
      directory,
      initial_registry: makeRegistry("topology-1"),
    });
    writer.appendReceipt(first);
    const before = readFileSync(join(directory, "receipts.json"), "utf8");

    const reader = createFileSystemStorageAdapter({ directory, read_only: true });
    deepEqual(reader.listReceipts(), [first]);
    deepEqual(reader.readRegistry(), makeRegistry("topology-1"));

    // The read left the on-disk bytes untouched.
    equal(readFileSync(join(directory, "receipts.json"), "utf8"), before);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("read-only open of a bare (existing-but-empty) dir does NOT seed files (B5)", () => {
  const directory = mkdtempSync(join(tmpdir(), "reactor-ro-bare-"));
  try {
    const storage = createFileSystemStorageAdapter({
      directory,
      read_only: true,
    });
    deepEqual(storage.listReceipts(), []);
    // The bare dir stays bare — no receipts.json / registry.json seeded, so the
    // "not a state dir" signal is preserved.
    ok(!existsSync(join(directory, "receipts.json")));
    ok(!existsSync(join(directory, "registry.json")));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

function makeRegistry(topologyTag: string): ReactorRuntimeRegistrySnapshot {
  return {
    topology: {
      tag: topologyTag,
      nodes: ["node.release-risk"],
      edges: [],
    },
    self_schedule: {
      "node.release-risk": { next_self_wake: "2026-05-18T13:00:00Z" },
    },
  };
}

function makeReceipt(status: "rendered" | "skipped"): Receipt {
  return {
    node: asNodeId("node.release-risk"),
    contract_fingerprint: asFingerprint(CONTRACT_FP),
    wake: { source: "input", refs: [CONTRACT_FP as `sha256:${string}`] },
    input_fingerprints: [asFingerprint(ATOMIC_FP)],
    fingerprints: { [ATOMIC_FACET]: asFingerprint(ATOMIC_FP) },
    semantic_diff: status === "skipped" ? EMPTY_SEMANTIC_DIFF : { moved: true },
    prev: null,
    status,
    cost: {
      provider: "p",
      model: "m",
      tokens: { fresh: status === "skipped" ? 0 : 4, reused: 0 },
      surprise_cause: "input",
    },
    sig: createNullSignature(),
  };
}
