import { deepEqual, equal, match, ok } from "node:assert/strict";
import { test } from "node:test";

import {
  ATOMIC_FACET,
  EMPTY_SEMANTIC_DIFF,
  asFingerprint,
  createNullSignature,
} from "../../shapes/index";
import {
  RECEIPT_HASH_ALGORITHM,
  RECEIPT_SCHEMA,
  type LedgerReceipt,
  type ReceiptInput,
  assertReceipt,
  canonicalizeForReceipt,
  computeReceiptContentHash,
  createReceipt,
  createSkippedReceipt,
  inspectReceiptProof,
  serializeReceipt,
  verifyReceipt,
  verifyReceiptChain,
} from "../index";

const FP_CONTRACT = "fp:contract:incident-briefing@7";
const FP_INPUT_A = "fp:input:a";
const FP_INPUT_B = "fp:input:b";
const FP_ATOMIC = "fp:atomic:v1";
const FP_FACET_SUMMARY = "fp:facet:summary";

const REF_A =
  "sha256:1111111111111111111111111111111111111111111111111111111111111111" as const;
const REF_B =
  "sha256:2222222222222222222222222222222222222222222222222222222222222222" as const;

function makeReceiptInput(overrides: Partial<ReceiptInput> = {}): ReceiptInput {
  return {
    node: "node.incident-briefing",
    contract_fingerprint: FP_CONTRACT,
    wake: { source: "input", refs: [REF_A] },
    input_fingerprints: [FP_INPUT_A, FP_INPUT_B],
    fingerprints: {
      [ATOMIC_FACET]: FP_ATOMIC,
      summary: FP_FACET_SUMMARY,
    },
    semantic_diff: { changed: ["summary"] },
    prev: null,
    status: "rendered",
    cost: {
      provider: "anthropic",
      model: "claude-opus",
      tokens: { fresh: 1200, reused: 300 },
      surprise_cause: "input",
    },
    sig: createNullSignature(),
    ...overrides,
  };
}

test("receipt round-trips its ideal fields through canonical content addressing", () => {
  const receipt = createReceipt(makeReceiptInput());
  const verification = verifyReceipt(receipt);

  equal(receipt.schema, RECEIPT_SCHEMA);
  equal(receipt.hash_algorithm, RECEIPT_HASH_ALGORITHM);
  equal(verification.ok, true);
  match(receipt.content_hash, /^sha256:[a-f0-9]{64}$/);
  equal(receipt.status, "rendered");
  equal(receipt.contract_fingerprint, FP_CONTRACT);
  deepEqual(receipt.input_fingerprints, [FP_INPUT_A, FP_INPUT_B]);
  equal(receipt.fingerprints[ATOMIC_FACET], FP_ATOMIC);
  equal(receipt.wake.source, "input");

  const serialized = serializeReceipt(receipt);
  const parsed = JSON.parse(serialized) as LedgerReceipt;
  deepEqual(parsed, receipt);
  deepEqual(verifyReceipt(parsed), { ok: true, content_hash: receipt.content_hash });
});

test("content hash is deterministic and sha256 over the canonical form", () => {
  const a = createReceipt(makeReceiptInput());
  const b = createReceipt(makeReceiptInput());
  equal(a.content_hash, b.content_hash);

  const expected = computeReceiptContentHash(a);
  equal(a.content_hash, expected);

  // Key order in fingerprints must not change the canonical hash.
  const reordered = createReceipt(
    makeReceiptInput({
      fingerprints: { summary: FP_FACET_SUMMARY, [ATOMIC_FACET]: FP_ATOMIC },
    }),
  );
  equal(reordered.content_hash, a.content_hash);
});

test("a moved fingerprint changes the content hash", () => {
  const base = createReceipt(makeReceiptInput());
  const moved = createReceipt(
    makeReceiptInput({ fingerprints: { [ATOMIC_FACET]: asFingerprint("fp:atomic:v2") } }),
  );
  ok(base.content_hash !== moved.content_hash);
});

test("tampering with a field is detected as chain inconsistency", () => {
  const receipt = createReceipt(makeReceiptInput());
  const tampered = { ...receipt, node: "node.someone-else" };
  const verification = verifyReceipt(tampered);
  equal(verification.ok, false);
  if (!verification.ok) {
    ok(verification.errors.some((e) => e.includes("content_hash does not match")));
  }
});

test("wake is a structured field, not a bare enum", () => {
  const verification = verifyReceipt({
    ...createReceipt(makeReceiptInput()),
    wake: "input",
  });
  equal(verification.ok, false);
});

test("fingerprints must always include the reserved atomic facet", () => {
  const input = makeReceiptInput({ fingerprints: { summary: FP_FACET_SUMMARY } });
  let threw = false;
  try {
    createReceipt(input);
  } catch (error) {
    threw = true;
    ok((error as Error).message.includes(ATOMIC_FACET));
  }
  equal(threw, true);
});

test("cost.surprise_cause must echo wake.source", () => {
  const input = makeReceiptInput({
    wake: { source: "self", refs: [REF_A] },
    cost: {
      provider: "anthropic",
      model: "claude-opus",
      tokens: { fresh: 10, reused: 0 },
      surprise_cause: "input",
    },
  });
  let threw = false;
  try {
    createReceipt(input);
  } catch (error) {
    threw = true;
    ok((error as Error).message.includes("cost.surprise_cause must match wake.source"));
  }
  equal(threw, true);
});

test("only the null signer is accepted in v1", () => {
  const input = makeReceiptInput({
    sig: {
      scheme: "ed25519",
      signer_id: "x",
      signature: "y",
      signed_payload_hash: REF_A,
    } as never,
  });
  let threw = false;
  try {
    createReceipt(input);
  } catch {
    threw = true;
  }
  equal(threw, true);
});

test("the demolished judge fields are rejected", () => {
  const receipt = createReceipt(makeReceiptInput());
  const withVerdict = { ...receipt, verdict: { status: "up" } };
  const verification = verifyReceipt(withVerdict);
  equal(verification.ok, false);
  if (!verification.ok) {
    ok(verification.errors.some((e) => e.includes("verdict")));
  }
});

test("a skipped receipt copies fingerprints forward with empty diff and zero cost", () => {
  const skipped = createSkippedReceipt({
    node: "node.incident-briefing",
    contract_fingerprint: FP_CONTRACT,
    wake: { source: "self", refs: [REF_A] },
    input_fingerprints: [FP_INPUT_A],
    fingerprints: { [ATOMIC_FACET]: FP_ATOMIC },
    prev: REF_A,
  });

  equal(skipped.status, "skipped");
  deepEqual(skipped.semantic_diff, EMPTY_SEMANTIC_DIFF);
  equal(skipped.cost.tokens.fresh, 0);
  equal(skipped.cost.surprise_cause, "self");
  equal(verifyReceipt(skipped).ok, true);
});

test("a skipped receipt with a non-empty diff is rejected", () => {
  const receipt = createReceipt(
    makeReceiptInput({
      status: "skipped",
      semantic_diff: EMPTY_SEMANTIC_DIFF,
      cost: {
        provider: "none",
        model: "none",
        tokens: { fresh: 0, reused: 0 },
        surprise_cause: "input",
      },
    }),
  );
  const verification = verifyReceipt({
    ...receipt,
    semantic_diff: { changed: ["x"] },
  });
  equal(verification.ok, false);
});

test("failed receipts are valid audit signal", () => {
  const failed = createReceipt(
    makeReceiptInput({
      status: "failed",
      semantic_diff: { error: "postcondition: acyclic violated" },
    }),
  );
  equal(failed.status, "failed");
  equal(verifyReceipt(failed).ok, true);
});

test("prev chains the node-scoped ledger", () => {
  const first = createReceipt(makeReceiptInput({ prev: null }));
  const second = createReceipt(
    makeReceiptInput({
      prev: first.content_hash,
      fingerprints: { [ATOMIC_FACET]: asFingerprint("fp:atomic:v2") },
    }),
  );

  const result = verifyReceiptChain([first, second]);
  equal(result.ok, true);
  if (result.ok) {
    equal(result.length, 2);
    equal(result.head, second.content_hash);
  }
});

test("a broken prev link is rejected by the chain verifier", () => {
  const first = createReceipt(makeReceiptInput({ prev: null }));
  const orphan = createReceipt(makeReceiptInput({ prev: REF_B }));
  const result = verifyReceiptChain([first, orphan]);
  equal(result.ok, false);
});

test("a cross-node receipt breaks the node-scoped ledger", () => {
  const first = createReceipt(makeReceiptInput({ prev: null }));
  const foreign = createReceipt(
    makeReceiptInput({ node: "node.other", prev: first.content_hash }),
  );
  const result = verifyReceiptChain([first, foreign]);
  equal(result.ok, false);
});

test("proof inspection summarizes without leaking private payloads", () => {
  const receipt = createReceipt(makeReceiptInput());
  const inspection = inspectReceiptProof(receipt);

  equal(inspection.ok, true);
  equal(inspection.schema, RECEIPT_SCHEMA);
  equal(inspection.node, "node.incident-briefing");
  equal(inspection.contract_fingerprint, FP_CONTRACT);
  equal(inspection.wake_source, "input");
  equal(inspection.status, "rendered");
  equal(inspection.input_fingerprint_count, 2);
  equal(inspection.facet_count, 2);
  equal(inspection.has_atomic_facet, true);
  equal(inspection.content_hash, receipt.content_hash);
  deepEqual(inspection.signer, { kind: "null", scheme: "none" });
  equal(inspection.cost.surprise_cause, "input");
  ok(!Object.prototype.hasOwnProperty.call(inspection, "semantic_diff"));
});

test("assertReceipt throws on an invalid receipt", () => {
  let threw = false;
  try {
    assertReceipt({ schema: RECEIPT_SCHEMA });
  } catch {
    threw = true;
  }
  equal(threw, true);
});

test("canonicalizer sorts object keys deterministically", () => {
  const a = canonicalizeForReceipt({ b: 1, a: 2 });
  const b = canonicalizeForReceipt({ a: 2, b: 1 });
  equal(a, b);
  equal(a, '{"a":2,"b":1}');
});
