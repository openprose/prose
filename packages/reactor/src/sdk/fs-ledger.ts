// The DURABLE receipt ledger — a `MutableReceiptLedger` whose append-only
// receipt trail survives a process restart, and whose per-node `lastReceipt`
// chains are RE-DERIVED from the persisted trail on construction.
//
// This is the persistence half the assembler needs (gap-audit 00-INVENTORY #10:
// "the FS receipt log isn't a `ReceiptLedgerPort`"). The reference
// `InMemoryReceiptLedger` (mounted-dag.ts) keeps the per-node chains + the
// append order in RAM only; this drop-in keeps the SAME `MutableReceiptLedger`
// interface but writes every receipt through an injected durable
// `ReactorStorageAdapter` (e.g. the filesystem `storage-fs` adapter), so the
// node-scoped memory (architecture.md §5.1) outlives the process.
//
// Source of truth:
//   - architecture.md §5.1 (L242–L249): the receipt is "the unit of the ledger
//     … the append-only receipt trail (a node's durable memory)"; "verified
//     before append"; verification is chain-consistency.
//   - architecture.md §8 (L391–L392): "Dirty/coalesce state … on crash it is
//     re-derived from unconsumed upstream receipts (the ledger is the source of
//     truth)." The ledger therefore MUST reconstruct itself from the trail at
//     boot — exactly what `#rehydrate` does here.
//   - gap-audit 00-INVENTORY #10: persistence modules exist + are unit-tested,
//     but the FS receipt log was not yet a `ReceiptLedgerPort`. THIS file is the
//     missing adapter.
//
// The reconciler only ever reads `lastReceipt(node)` + appends; restart-survival
// means: construct a fresh `FileSystemReceiptLedger` over the SAME storage
// adapter (re-opened on the same directory) and `lastReceipt(node)` returns the
// node's most recent committed receipt, with its content_hash intact, so the
// memo key the reconciler compares against (`(contract_fp, input_fp)`) is the
// same one the prior process left — no re-render of an unchanged node after a
// restart ("cost scales with surprise", not the restart).

import type { ContentAddress, Receipt } from "../shapes";
import {
  computeReceiptContentHash,
  createReceipt,
  type LedgerReceipt,
} from "../receipt";
import type { ReactorStorageAdapter } from "../adapters/types";
import type { MutableReceiptLedger } from "./mounted-dag";

export interface FileSystemReceiptLedgerInput {
  /**
   * The durable storage adapter the ledger appends through and re-derives from.
   * In production this is the filesystem `storage-fs` adapter (its
   * `appendReceipt`/`listReceipts` persist the trail to disk); any
   * `ReactorStorageAdapter` works (the in-memory one yields an in-memory ledger
   * with the same re-derivation semantics, which is what the tests inject).
   */
  readonly storage: ReactorStorageAdapter;
}

/**
 * The durable receipt ledger. A drop-in for `InMemoryReceiptLedger` behind the
 * SAME `MutableReceiptLedger` interface — `mountDag({ ledger })` and the
 * assembler inject it with no caller changes. On construction it RE-DERIVES the
 * per-node chains + append order from `storage.listReceipts()` (architecture.md
 * §8: "the ledger is the source of truth"), so a process restart re-opens the
 * full prior memory.
 */
export class FileSystemReceiptLedger implements MutableReceiptLedger {
  readonly #storage: ReactorStorageAdapter;
  readonly #byNode = new Map<string, LedgerReceipt[]>();
  #order: LedgerReceipt[] = [];

  constructor(input: FileSystemReceiptLedgerInput) {
    if (input.storage === undefined || input.storage === null) {
      throw new TypeError("FileSystemReceiptLedger requires a storage adapter");
    }
    this.#storage = input.storage;
    this.#rehydrate();
  }

  lastReceipt(node: string): Receipt | null {
    const chain = this.#byNode.get(node);
    if (chain === undefined || chain.length === 0) {
      return null;
    }
    return chain[chain.length - 1] as LedgerReceipt;
  }

  append(receipt: Receipt): ContentAddress {
    // Stamp + verify the envelope (content-addressed + verified before append,
    // architecture.md §5.1). `createReceipt` throws on a malformed body or a
    // torn content_hash, so a corrupt receipt never reaches the durable trail.
    const stamped = createReceipt(receipt);
    // Persist FIRST (durable trail), THEN update the in-RAM index, so the
    // re-derivation on a future boot sees exactly what is in RAM now (the trail
    // and the index never diverge).
    this.#storage.appendReceipt(stamped);
    this.#index(stamped);
    return stamped.content_hash;
  }

  addressOf(receipt: Receipt): ContentAddress | null {
    // The ledger owns content-addressing (delta.md §A3.2): compute the receipt's
    // content hash over its canonical form — whether or not it was appended (the
    // reconciler uses it for the next receipt's `prev` pointer).
    try {
      return computeReceiptContentHash({
        schema: "openprose.receipt",
        hash_algorithm: "sha256",
        node: receipt.node,
        contract_fingerprint: receipt.contract_fingerprint,
        wake: receipt.wake,
        input_fingerprints: receipt.input_fingerprints,
        fingerprints: receipt.fingerprints,
        semantic_diff: receipt.semantic_diff,
        prev: receipt.prev,
        status: receipt.status,
        cost: receipt.cost,
        sig: receipt.sig,
      });
    } catch {
      return null;
    }
  }

  all(): readonly LedgerReceipt[] {
    return [...this.#order];
  }

  // -------------------------------------------------------------------------
  // internals
  // -------------------------------------------------------------------------

  /**
   * Rebuild the per-node chains + append order from the durable trail
   * (architecture.md §8: "re-derived … the ledger is the source of truth"). Each
   * persisted receipt body is re-stamped through `createReceipt` so its
   * content_hash is recomputed and verified — a tampered/corrupt trail entry
   * throws here at boot rather than silently poisoning the memo key. The trail's
   * persisted order IS the append order (the storage adapter appends in order).
   */
  #rehydrate(): void {
    this.#byNode.clear();
    this.#order = [];
    for (const receipt of this.#storage.listReceipts()) {
      this.#index(createReceipt(receipt));
    }
  }

  #index(stamped: LedgerReceipt): void {
    let chain = this.#byNode.get(stamped.node);
    if (chain === undefined) {
      chain = [];
      this.#byNode.set(stamped.node, chain);
    }
    chain.push(stamped);
    this.#order.push(stamped);
  }
}

/**
 * Construct the durable receipt ledger over a storage adapter. Thin sugar over
 * the class for symmetry with the other adapter factories.
 */
export function createFileSystemReceiptLedger(
  input: FileSystemReceiptLedgerInput,
): FileSystemReceiptLedger {
  return new FileSystemReceiptLedger(input);
}
