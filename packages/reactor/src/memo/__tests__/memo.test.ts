import { deepEqual, equal, notEqual, ok, throws } from "node:assert/strict";
import { test } from "node:test";

import {
  InMemoryMemoStore,
  type MemoEntry,
  computeMemoKey,
  createSkippedReceipt,
  memoKeyDigest,
  memoKeysEqual,
} from "../index";
import { ATOMIC_FACET, type FingerprintMap, type Wake, asFingerprint} from "../../shapes";

const CONTRACT_A = "sha256:aaaa";
const CONTRACT_B = "sha256:bbbb";
const INPUT_A = "sha256:1111";
const INPUT_B = "sha256:2222";
const RECEIPT_REF =
  "sha256:0000000000000000000000000000000000000000000000000000000000000000" as const;

const FP: FingerprintMap = Object.freeze({
  [ATOMIC_FACET]: asFingerprint("sha256:wm-atomic"),
  recommendation: asFingerprint("sha256:wm-rec"),
});

const WAKE_INPUT: Wake = { source: "input", refs: [RECEIPT_REF] };

function entry(overrides: Partial<MemoEntry> = {}): MemoEntry {
  const key = computeMemoKey(asFingerprint(CONTRACT_A), [INPUT_A]);
  return {
    node: "node.vendor-watch",
    key,
    digest: memoKeyDigest(key),
    fingerprints: FP,
    receipt_ref: RECEIPT_REF,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Memo key = EXACTLY (contract_fingerprint, input_fingerprints) — nothing else.
// world-model.md §4; SHAPES.md §3.
// ---------------------------------------------------------------------------

test("memo key is exactly (contract_fingerprint, input_fingerprints)", () => {
  const key = computeMemoKey(asFingerprint(CONTRACT_A), [INPUT_A, INPUT_B]);
  deepEqual(Object.keys(key).sort(), ["contract_fingerprint", "input_fingerprints"]);
  equal(key.contract_fingerprint, CONTRACT_A);
  deepEqual([...key.input_fingerprints], [INPUT_A, INPUT_B]);
});

test("equal halves ⇒ equal key digest (the skip condition)", () => {
  const left = computeMemoKey(asFingerprint(CONTRACT_A), [INPUT_A, INPUT_B]);
  const right = computeMemoKey(asFingerprint(CONTRACT_A), [INPUT_A, INPUT_B]);
  ok(memoKeysEqual(left, right));
  equal(memoKeyDigest(left), memoKeyDigest(right));
});

test("a moved contract fingerprint moves the key (contract change ⇒ memo miss)", () => {
  const before = computeMemoKey(asFingerprint(CONTRACT_A), [INPUT_A]);
  const after = computeMemoKey(asFingerprint(CONTRACT_B), [INPUT_A]);
  ok(!memoKeysEqual(before, after));
});

test("a moved input fingerprint moves the key (the watched thing changed)", () => {
  const before = computeMemoKey(asFingerprint(CONTRACT_A), [INPUT_A]);
  const after = computeMemoKey(asFingerprint(CONTRACT_A), [INPUT_B]);
  ok(!memoKeysEqual(before, after));
});

test("input fingerprint order is significant (subscription-slot meaning)", () => {
  const ab = computeMemoKey(asFingerprint(CONTRACT_A), [INPUT_A, INPUT_B]);
  const ba = computeMemoKey(asFingerprint(CONTRACT_A), [INPUT_B, INPUT_A]);
  ok(!memoKeysEqual(ab, ba));
});

test("computeMemoKey rejects an empty fingerprint token", () => {
  throws(() => computeMemoKey(asFingerprint(""), [asFingerprint(INPUT_A)]), /contract_fingerprint/);
  throws(() => computeMemoKey(asFingerprint(CONTRACT_A), [""]), /input_fingerprints\[0\]/);
});

// ---------------------------------------------------------------------------
// The skip decision (replaces the cached verdict). architecture.md §4.1.
// ---------------------------------------------------------------------------

test("cold start ⇒ render (no prior receipt for the node)", () => {
  const store = new InMemoryMemoStore();
  const decision = store.decide("node.vendor-watch", computeMemoKey(asFingerprint(CONTRACT_A), [INPUT_A]));
  equal(decision.outcome, "render");
  if (decision.outcome === "render") equal(decision.reason, "cold-start");
});

test("unmoved key ⇒ skip, carrying the prior entry forward", () => {
  const store = new InMemoryMemoStore();
  store.record(entry());
  const decision = store.decide("node.vendor-watch", computeMemoKey(asFingerprint(CONTRACT_A), [INPUT_A]));
  equal(decision.outcome, "skip");
  if (decision.outcome === "skip") {
    deepEqual(decision.entry.fingerprints, FP);
    equal(decision.entry.receipt_ref, RECEIPT_REF);
  }
});

test("moved key ⇒ render with reason key-moved", () => {
  const store = new InMemoryMemoStore();
  store.record(entry());
  const decision = store.decide("node.vendor-watch", computeMemoKey(asFingerprint(CONTRACT_A), [INPUT_B]));
  equal(decision.outcome, "render");
  if (decision.outcome === "render") equal(decision.reason, "key-moved");
});

test("store is node-scoped, with no policy-artifact namespace term", () => {
  const store = new InMemoryMemoStore();
  store.record(entry({ node: "node.a" }));
  // A different node with the same key still cold-starts (independent ledger).
  equal(store.decide("node.b", computeMemoKey(asFingerprint(CONTRACT_A), [INPUT_A])).outcome, "render");
  equal(store.decide("node.a", computeMemoKey(asFingerprint(CONTRACT_A), [INPUT_A])).outcome, "skip");
});

test("record requires the atomic facet in the fingerprint map", () => {
  const store = new InMemoryMemoStore();
  throws(
    () => store.record(entry({ fingerprints: Object.freeze({ recommendation: asFingerprint("sha256:x") }) })),
    /atomic facet/,
  );
});

// ---------------------------------------------------------------------------
// The skipped receipt (architecture.md §4.1, §8; SHAPES.md §4).
// ---------------------------------------------------------------------------

test("createSkippedReceipt copies fingerprints forward, empty diff, zero cost, chains prev", () => {
  const key = computeMemoKey(asFingerprint(CONTRACT_A), [INPUT_A]);
  const receipt = createSkippedReceipt({
    node: "node.vendor-watch",
    contract_fingerprint: asFingerprint(CONTRACT_A),
    wake: WAKE_INPUT,
    key,
    entry: entry(),
  });

  equal(receipt.status, "skipped");
  deepEqual(receipt.fingerprints, FP); // unchanged truth carried forward
  deepEqual(receipt.semantic_diff, {}); // EMPTY_SEMANTIC_DIFF
  equal(receipt.cost.tokens.fresh, 0);
  equal(receipt.cost.tokens.reused, 0);
  equal(receipt.cost.surprise_cause, "input");
  equal(receipt.prev, RECEIPT_REF); // chains the ledger
  deepEqual([...receipt.input_fingerprints], [INPUT_A]);
  equal(receipt.sig.scheme, "none");
});

test("createSkippedReceipt rejects a node/entry mismatch", () => {
  throws(
    () =>
      createSkippedReceipt({
        node: "node.x",
        contract_fingerprint: asFingerprint(CONTRACT_A),
        wake: WAKE_INPUT,
        key: computeMemoKey(asFingerprint(CONTRACT_A), [INPUT_A]),
        entry: entry({ node: "node.y" }),
      }),
    /node must match/,
  );
});

test("a skipped receipt at cold-start-of-chain has null prev", () => {
  const key = computeMemoKey(asFingerprint(CONTRACT_A), [INPUT_A]);
  const receipt = createSkippedReceipt({
    node: "node.vendor-watch",
    contract_fingerprint: asFingerprint(CONTRACT_A),
    wake: { source: "self", refs: [] },
    key,
    entry: entry({ receipt_ref: null }),
  });
  equal(receipt.prev, null);
  equal(receipt.cost.surprise_cause, "self");
});
