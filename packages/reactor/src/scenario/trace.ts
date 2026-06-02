// Assertion helpers over the receipt ledger + drain results
// (TEST_HARNESS_PROPOSAL.md §3.3). The ledger (`ledger.all()`, append-only,
// node-scoped) IS the trace; the drain's `ReconcileResult[]` is the per-turn
// disposition record. These read both so the unit tests can assert WHO woke, WHO
// memoized, and WHAT each receipt cited — without re-deriving the reconciler's
// bookkeeping in every test.

import { type Facet } from "../shapes";
import { type Receipt } from "../receipt";
import {
  type ReconcileDisposition,
  type ReconcileResult,
} from "../reactor";
import { type MutableReceiptLedger } from "../sdk/mounted-dag";

/** The disposition the reconciler reached for `node` this drain (or undefined). */
export function dispositionOf(
  results: readonly ReconcileResult[],
  node: string,
): ReconcileDisposition | undefined {
  return results.find((r) => r.node === node)?.disposition;
}

/** Was `node` part of this drain at all? (Absent ⇒ never woken — a no-op propagation.) */
export function woke(
  results: readonly ReconcileResult[],
  node: string,
): boolean {
  return results.some((r) => r.node === node);
}

/** Nodes that actually rendered this drain (a render body ran + committed). */
export function renderedNodes(
  results: readonly ReconcileResult[],
): readonly string[] {
  return results.filter((r) => r.disposition === "rendered").map((r) => r.node);
}

/** Nodes that the reconciler memo-skipped this drain (cheap receipt, no render). */
export function skippedNodes(
  results: readonly ReconcileResult[],
): readonly string[] {
  return results.filter((r) => r.disposition === "skipped").map((r) => r.node);
}

/** How many times `node` appears in this drain with `disposition`. */
export function countDisposition(
  results: readonly ReconcileResult[],
  node: string,
  disposition: ReconcileDisposition,
): number {
  return results.filter(
    (r) => r.node === node && r.disposition === disposition,
  ).length;
}

/** The node's most recent receipt, or null at cold start. */
export function lastReceipt(
  ledger: MutableReceiptLedger,
  node: string,
): Receipt | null {
  return ledger.lastReceipt(node);
}

/** Every receipt the node ever signed, in append order. */
export function receiptsFor(
  ledger: MutableReceiptLedger,
  node: string,
): readonly Receipt[] {
  return ledger.all().filter((r) => r.node === node);
}

/** The resolved fingerprint a producer's last receipt published for `facet`. */
export function facetFingerprint(
  ledger: MutableReceiptLedger,
  node: string,
  facet: Facet,
): string | undefined {
  return ledger.lastReceipt(node)?.fingerprints[facet];
}

/**
 * The receipt chain (node → status) in append order, restricted to a node set —
 * the "readable chain from event to projection" U04 asks for.
 */
export function chain(
  ledger: MutableReceiptLedger,
  nodes: readonly string[],
): readonly { node: string; status: Receipt["status"] }[] {
  const set = new Set(nodes);
  return ledger
    .all()
    .filter((r) => set.has(r.node))
    .map((r) => ({ node: r.node, status: r.status }));
}
