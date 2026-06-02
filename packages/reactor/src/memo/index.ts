// memo/ — the React.memo skip decision.
//
// RESHAPE (delta.md §A3.3, Part F "Memo key richness"): the memo key is EXACTLY
// `(contract_fingerprint, input_fingerprints)` — nothing else. The old triple
// `(contract_revision, evidence_receipts, dependency_receipts)` and the
// policy-artifact namespace are gone (they belonged to the retired
// judge → verdict → policy spine). This module no longer caches a *verdict*; it
// caches the **skip decision** (architecture.md §4.1: "if neither moved since
// the node's last receipt, write a cheap `skipped` receipt and spawn nothing").
//
// Source of truth: world-model.md §4 ("the memoization key is
// `(contract-fingerprint, input-fingerprints)` — nothing else"); architecture.md
// §4.1 (reconciler memo/skip); SHAPES.md §3. Conforms to `../shapes`
// (Foundation wave) — the canonical `MemoKey` / `Receipt` shapes.

import { renderAdapterJson } from "../adapters/json";
import {
  ATOMIC_FACET,
  EMPTY_SEMANTIC_DIFF,
  asNodeId,
  type Fingerprint,
  type FingerprintMap,
  type InputFingerprints,
  type MemoKey,
  type Receipt,
  type Wake,
  createNullSignature,
  makeMemoKey,
} from "../shapes";

export const MEMO_KEY_SCHEMA = "openprose.memo-key" as const;
export const MEMO_KEY_VERSION = 1 as const;

/**
 * A stable, comparable serialization of a memo key. The reconciler compares two
 * keys by string equality; this is the canonical form that makes the comparison
 * total and order-stable. `input_fingerprints` order is the resolved
 * subscription order from the topology world-model (SHAPES.md §3), so it is
 * preserved verbatim — NOT sorted — because position carries the
 * facet-slot meaning.
 */
export type MemoKeyDigest = string;

// ---------------------------------------------------------------------------
// Memo key construction + serialization
// ---------------------------------------------------------------------------

/**
 * Build the memo key from EXACTLY the contract fingerprint and the input
 * fingerprint tuple (world-model.md §4). Re-exports the canonical `makeMemoKey`
 * from `../shapes` and validates the two halves are well-formed.
 */
export function computeMemoKey(
  contract_fingerprint: string,
  input_fingerprints: readonly string[],
): MemoKey {
  assertFingerprint(contract_fingerprint, "contract_fingerprint");
  input_fingerprints.forEach((fp, index) =>
    assertFingerprint(fp, `input_fingerprints[${index}]`),
  );
  return makeMemoKey(contract_fingerprint, input_fingerprints);
}

/**
 * The canonical, comparable digest of a memo key. Two keys are equal iff their
 * digests are equal. The digest folds in the schema/version so a future re-key
 * never silently collides with a v1 key.
 */
export function memoKeyDigest(key: MemoKey): MemoKeyDigest {
  return renderAdapterJson({
    schema: MEMO_KEY_SCHEMA,
    v: MEMO_KEY_VERSION,
    contract_fingerprint: key.contract_fingerprint,
    input_fingerprints: [...key.input_fingerprints],
  });
}

/** Structural equality on memo keys: same contract fp AND same ordered tuple. */
export function memoKeysEqual(left: MemoKey, right: MemoKey): boolean {
  return memoKeyDigest(left) === memoKeyDigest(right);
}

// ---------------------------------------------------------------------------
// The skip decision (replaces the cached verdict)
// ---------------------------------------------------------------------------

/**
 * What the store remembers per node: the memo key of the node's last receipt and
 * the published fingerprints that receipt committed. On the next wake the
 * reconciler re-derives the candidate key and compares; an equal key means
 * "nothing moved → skip". The carried `fingerprints` are copied forward onto the
 * `skipped` receipt (architecture.md §8 dirty/coalesce; SHAPES.md §4: "a
 * `skipped` receipt copies the unchanged `fingerprints` forward").
 */
export interface MemoEntry {
  readonly node: string;
  readonly key: MemoKey;
  readonly digest: MemoKeyDigest;
  /** The published truth the last receipt committed — copied forward on a skip. */
  readonly fingerprints: FingerprintMap;
  /** Content address of the last receipt; becomes a skipped receipt's `prev`. */
  readonly receipt_ref: `sha256:${string}` | null;
}

/**
 * The skip-vs-render decision (architecture.md §4.1). `skip` means the candidate
 * memo key matches the node's last receipt's key — neither the contract nor any
 * subscribed input moved — so the reconciler writes a `skipped` receipt and
 * spawns nothing. `render` means a half moved (or the node has no prior receipt)
 * so a render must be spawned.
 */
export type SkipDecision =
  | { readonly outcome: "skip"; readonly entry: MemoEntry }
  | { readonly outcome: "render"; readonly reason: "cold-start" | "key-moved" };

// ---------------------------------------------------------------------------
// The store — node-scoped last-receipt memo, NOT a policy-namespaced verdict cache
// ---------------------------------------------------------------------------

/**
 * Holds the last receipt's memo key + published fingerprints per node. Scoped by
 * `node` only — there is no policy-artifact namespace (delta.md §A3.3: the
 * namespace was a fourth key term serving the retired policy spine). The store
 * is the reconciler's "did anything move since last time?" memory.
 */
export class InMemoryMemoStore {
  private readonly byNode = new Map<string, MemoEntry>();

  /**
   * Decide skip-vs-render for `node` against a freshly-derived candidate key.
   * Cold start (no prior entry) ⇒ render. Key unchanged ⇒ skip (carrying the
   * prior entry so the reconciler can copy its `fingerprints` forward). Key
   * moved ⇒ render.
   */
  decide(node: string, candidate: MemoKey): SkipDecision {
    const prior = this.byNode.get(node);
    if (prior === undefined) {
      return { outcome: "render", reason: "cold-start" };
    }
    if (prior.digest === memoKeyDigest(candidate)) {
      return { outcome: "skip", entry: prior };
    }
    return { outcome: "render", reason: "key-moved" };
  }

  /**
   * Record the outcome of a committed receipt as the node's new memo state. Call
   * after a `rendered` receipt commits (the moved truth) AND after a `skipped`
   * receipt (the carried-forward truth) so `prev`/`receipt_ref` advances.
   */
  record(entry: MemoEntry): void {
    assertFingerprintMap(entry.fingerprints);
    this.byNode.set(entry.node, {
      node: entry.node,
      key: entry.key,
      digest: memoKeyDigest(entry.key),
      fingerprints: entry.fingerprints,
      receipt_ref: entry.receipt_ref,
    });
  }

  /** The current memo entry for a node, if any. */
  peek(node: string): MemoEntry | undefined {
    return this.byNode.get(node);
  }
}

// ---------------------------------------------------------------------------
// Building a `skipped` receipt from a skip decision
// ---------------------------------------------------------------------------

export interface SkippedReceiptInput {
  readonly node: string;
  readonly contract_fingerprint: Fingerprint;
  readonly wake: Wake;
  readonly key: MemoKey;
  /** The matched memo entry whose fingerprints/ref are carried forward. */
  readonly entry: MemoEntry;
  /** The provider/model that would have rendered — echoed for cost attribution. */
  readonly provider?: string;
  readonly model?: string;
}

/**
 * Build the cheap `skipped` receipt the reconciler writes when the memo key did
 * not move (architecture.md §4.1, §8). It copies the unchanged `fingerprints`
 * forward, carries `EMPTY_SEMANTIC_DIFF`, zero cost, and chains `prev` to the
 * prior receipt (SHAPES.md §4: "A `skipped` receipt copies the unchanged
 * `fingerprints` forward, carries `EMPTY_SEMANTIC_DIFF`, and zero `cost`").
 * `status` is `skipped`; only `rendered`-with-a-moved-fingerprint propagates
 * (world-model.md §8), so this receipt wakes nothing.
 */
export function createSkippedReceipt(input: SkippedReceiptInput): Receipt {
  if (input.entry.node !== input.node) {
    throw new Error("skipped receipt node must match the memo entry node");
  }
  assertFingerprint(input.contract_fingerprint, "contract_fingerprint");
  assertFingerprintMap(input.entry.fingerprints);

  return {
    node: asNodeId(input.node),
    contract_fingerprint: input.contract_fingerprint,
    wake: input.wake,
    input_fingerprints: [...input.key.input_fingerprints],
    fingerprints: input.entry.fingerprints,
    semantic_diff: EMPTY_SEMANTIC_DIFF,
    prev: input.entry.receipt_ref,
    status: "skipped",
    cost: {
      provider: input.provider ?? "memo",
      model: input.model ?? "memo-skip",
      tokens: { fresh: 0, reused: 0 },
      surprise_cause: input.wake.source,
    },
    sig: createNullSignature(),
  };
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function assertFingerprint(
  value: string,
  path: string,
): asserts value is Fingerprint {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${path} must be a non-empty fingerprint token`);
  }
}

function assertFingerprintMap(map: FingerprintMap): void {
  if (!(ATOMIC_FACET in map)) {
    throw new Error(`fingerprint map must contain the atomic facet ${ATOMIC_FACET}`);
  }
  for (const [facet, token] of Object.entries(map)) {
    assertFingerprint(token, `fingerprints[${facet}]`);
  }
}
