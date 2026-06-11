// Tests for the DURABLE receipt ledger (fs-ledger.ts) — the persisted
// `MutableReceiptLedger` whose per-node chains are RE-DERIVED from the storage
// trail at construction (architecture.md §5.1 / §8 "the ledger is the source of
// truth"; gap-audit 00-INVENTORY #10).

import { deepEqual, equal, notEqual, ok, throws } from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { ATOMIC_FACET, FAILURE_REASON_DIFF_KEY, type ContentAddress, type Receipt, asFingerprint, asNodeId} from "../../shapes";
import { createNullSignature } from "../../receipt";
import { createFileSystemStorageAdapter } from "../../adapters/storage-fs";
import { createMemoryStorageAdapter } from "../../adapters/storage-memory";
import { FileSystemReceiptLedger } from "../fs-ledger";

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "opledger-fs-"));
}

// A minimal valid receipt body for node `node`, chained off `prev`.
function receiptBody(
  node: string,
  status: "rendered" | "skipped",
  token: string,
  prev: ContentAddress | null,
): Receipt {
  const cost = {
    provider: status === "skipped" ? "none" : "openrouter",
    model: status === "skipped" ? "none" : "google/gemini-3.5-flash",
    tokens: { fresh: status === "skipped" ? 0 : 7, reused: 0 },
    surprise_cause: "external" as const,
  };
  return {
    node: asNodeId(node),
    contract_fingerprint: asFingerprint(`c:${node}@1`),
    wake: { source: "external", refs: [] },
    input_fingerprints: [],
    fingerprints: { [ATOMIC_FACET]: asFingerprint(token) },
    semantic_diff: {},
    prev,
    status,
    cost,
    sig: createNullSignature(),
  };
}

test("append persists through the storage trail and indexes lastReceipt", () => {
  const dir = tempDir();
  try {
    const storage = createFileSystemStorageAdapter({ directory: dir });
    const ledger = new FileSystemReceiptLedger({ storage });

    equal(ledger.lastReceipt("monitor"), null); // cold start

    const ref1 = ledger.append(receiptBody("monitor", "rendered", "t1", null));
    const last1 = ledger.lastReceipt("monitor");
    ok(last1);
    deepEqual(last1?.fingerprints, { [ATOMIC_FACET]: asFingerprint("t1") });

    const ref2 = ledger.append(receiptBody("monitor", "rendered", "t2", ref1));
    notEqual(ref1, ref2);
    deepEqual(ledger.lastReceipt("monitor")?.fingerprints, { [ATOMIC_FACET]: asFingerprint("t2") });

    // The durable trail holds both receipts in append order.
    equal(storage.listReceipts().length, 2);
    equal(ledger.all().length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("RESTART-SURVIVAL: a fresh ledger over the same directory re-derives every node's last receipt", () => {
  const dir = tempDir();
  try {
    // --- process 1: write a two-node, multi-receipt trail.
    const storage1 = createFileSystemStorageAdapter({ directory: dir });
    const ledger1 = new FileSystemReceiptLedger({ storage: storage1 });
    const a1 = ledger1.append(receiptBody("alpha", "rendered", "a1", null));
    ledger1.append(receiptBody("alpha", "rendered", "a2", a1));
    ledger1.append(receiptBody("beta", "rendered", "b1", null));
    const alphaHead = ledger1.lastReceipt("alpha")?.fingerprints;
    const betaHead = ledger1.lastReceipt("beta")?.fingerprints;

    // --- process 2: a BRAND NEW storage adapter + ledger over the SAME dir.
    const storage2 = createFileSystemStorageAdapter({ directory: dir });
    const ledger2 = new FileSystemReceiptLedger({ storage: storage2 });

    // The re-derived chains match the prior process's heads — node memory
    // survived the restart (architecture.md §8 "re-derived … the ledger is the
    // source of truth").
    deepEqual(ledger2.lastReceipt("alpha")?.fingerprints, alphaHead);
    deepEqual(ledger2.lastReceipt("beta")?.fingerprints, betaHead);
    equal(ledger2.all().length, 3);

    // The re-derived content hash is identical (the prev pointer survives), so a
    // subsequent append chains onto the restored head with no break.
    const restoredHead = ledger2.lastReceipt("alpha");
    const restoredHash = ledger2.addressOf(restoredHead as Receipt);
    ok(restoredHash);
    ledger2.append(receiptBody("alpha", "rendered", "a3", restoredHash));
    equal(ledger2.all().length, 4);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("RESTART-SURVIVAL: a failed receipt carrying a reason re-derives with its hash intact", () => {
  const dir = tempDir();
  try {
    // --- process 1: a rendered receipt, then a failed one carrying a reason.
    const storage1 = createFileSystemStorageAdapter({ directory: dir });
    const ledger1 = new FileSystemReceiptLedger({ storage: storage1 });
    const r1 = ledger1.append(receiptBody("monitor", "rendered", "t1", null));
    const failed: Receipt = {
      ...receiptBody("monitor", "rendered", "t1", r1),
      status: "failed",
      semantic_diff: { [FAILURE_REASON_DIFF_KEY]: "provider 402: insufficient credits" },
      cost: {
        provider: "none",
        model: "none",
        tokens: { fresh: 0, reused: 0 },
        surprise_cause: "external" as const,
      },
    };
    const r2 = ledger1.append(failed);

    // --- process 2: re-derivation re-stamps every receipt through createReceipt;
    // the reason survives byte-faithfully and the content address is unchanged.
    const storage2 = createFileSystemStorageAdapter({ directory: dir });
    const ledger2 = new FileSystemReceiptLedger({ storage: storage2 });
    const head = ledger2.lastReceipt("monitor");
    equal(head?.status, "failed");
    equal(head?.semantic_diff[FAILURE_REASON_DIFF_KEY], "provider 402: insufficient credits");
    equal(ledger2.addressOf(head as Receipt), r2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("re-derivation re-stamps + verifies each receipt; a corrupt trail throws at boot", () => {
  // The in-memory storage adapter lets us seed a malformed receipt body. The
  // ledger re-stamps each through createReceipt at boot, so a corrupt entry is
  // rejected at construction rather than silently poisoning the memo key.
  const bad = { ...receiptBody("monitor", "rendered", "t1", null), node: "" };
  const storage = createMemoryStorageAdapter({ receipts: [bad as Receipt] });
  throws(() => new FileSystemReceiptLedger({ storage }));
});

test("addressOf is stable across a re-derivation (the prev pointer is reconstructable)", () => {
  const storage = createMemoryStorageAdapter();
  const ledger1 = new FileSystemReceiptLedger({ storage });
  const ref = ledger1.append(receiptBody("monitor", "rendered", "t1", null));

  // A second ledger over the same (in-memory) storage re-derives the same head
  // and computes the same content address for it.
  const ledger2 = new FileSystemReceiptLedger({ storage });
  const head = ledger2.lastReceipt("monitor");
  equal(ledger2.addressOf(head as Receipt), ref);
});
