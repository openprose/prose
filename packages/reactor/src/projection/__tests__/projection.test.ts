import { deepEqual, equal, ok } from "node:assert/strict";
import { test } from "node:test";

import { createReceipt, inspectReceiptProof, type LedgerReceipt } from "../../receipt";
import type { Receipt, WakeSource } from "../../shapes/index";
import {
  RECEIPT_PROJECTION_SCHEMA,
  RECEIPT_PROJECTION_TIERS,
  RECEIPT_PROJECTION_VERSION,
  type ReceiptProjectionResult,
  projectReceipt,
  projectReceiptProof,
} from "../index";

const CONTRACT_FP =
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
const INPUT_FP =
  "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const;
const ATOMIC_TOKEN =
  "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" as const;
const FACET_TOKEN =
  "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd" as const;
const WAKE_REF =
  "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as const;

test("receipt projections are deterministic across owner subscriber and public tiers", () => {
  const receipt = makeReceipt({
    tokens: { fresh: 12, reused: 34 },
    fingerprints: { "@atomic": ATOMIC_TOKEN, "funding": FACET_TOKEN },
  });

  const publicResult = projectReceipt({ tier: "public", receipt });
  assertProjectionOk(publicResult);
  deepEqual(publicResult.projection, {
    schema: RECEIPT_PROJECTION_SCHEMA,
    v: RECEIPT_PROJECTION_VERSION,
    tier: "public",
    receipt_id: receipt.content_hash,
    content_hash: receipt.content_hash,
    contract_fingerprint: CONTRACT_FP,
    status: "rendered",
    wake: { source: "input", ref_count: 1 },
    signer: { kind: "null", scheme: "none" },
    fingerprints: {
      facet_count: 2,
      atomic_facet_present: true,
    },
    cost: { fresh: 12, reused: 34, surprise_cause: "input" },
    input_fingerprint_count: 1,
  });

  const subscriberResult = projectReceipt({ tier: "subscriber", receipt });
  assertProjectionOk(subscriberResult);
  deepEqual(subscriberResult.projection, {
    schema: RECEIPT_PROJECTION_SCHEMA,
    v: RECEIPT_PROJECTION_VERSION,
    tier: "subscriber",
    receipt_id: receipt.content_hash,
    content_hash: receipt.content_hash,
    contract_fingerprint: CONTRACT_FP,
    status: "rendered",
    wake: { source: "input", ref_count: 1 },
    signer: { kind: "null", scheme: "none" },
    node: "node.incident-briefing",
    input_fingerprints: [INPUT_FP],
    fingerprints: {
      facets: ["@atomic", "funding"],
      atomic_facet_present: true,
      fingerprints: { "@atomic": ATOMIC_TOKEN, "funding": FACET_TOKEN },
    },
    cost: {
      fresh: 12,
      reused: 34,
      surprise_cause: "input",
      provider: "cradle-double",
      model: "deterministic-replay",
    },
  });

  const ownerResult = projectReceipt({ tier: "owner", receipt });
  assertProjectionOk(ownerResult);
  equal(ownerResult.projection.tier, "owner");
  if (ownerResult.projection.tier !== "owner") {
    throw new Error("expected owner projection");
  }
  equal(ownerResult.projection.proof.content_hash, receipt.content_hash);
  equal(ownerResult.projection.prev, null);
});

test("a proof summary projects only to the public tier", () => {
  const receipt = makeReceipt({
    status: "skipped",
    tokens: { fresh: 0, reused: 0 },
  });
  const proof = inspectReceiptProof(receipt);

  const publicResult = projectReceiptProof({ tier: "public", proof });
  assertProjectionOk(publicResult);
  equal(publicResult.projection.status, "skipped");
  equal(publicResult.projection.content_hash, receipt.content_hash);
  equal(publicResult.projection.tier, "public");
  if (publicResult.projection.tier !== "public") {
    throw new Error("expected public projection");
  }
  // The proof summary carries the wake source but not its refs.
  equal(publicResult.projection.wake.ref_count, null);
  equal(publicResult.projection.fingerprints.facet_count, 1);

  // A proof summary lacks the raw facet map, so richer tiers fail closed.
  const subscriberResult = projectReceiptProof({ tier: "subscriber", proof });
  assertProjectionFailure(subscriberResult);
  deepEqual(subscriberResult.errors, [
    "a proof summary can only be projected to the public tier",
  ]);
});

test("the strict receipt envelope keeps hostile out-of-schema payloads out of any projection", () => {
  const customerPayload = "customer payload: legal matter alpha";
  const hostileBearer = ["Bear", "er"].join("") + " credential_1234567890";
  // Out-of-schema keys make the receipt fail verification (exact-keys envelope),
  // so hostile data can never ride into a projection in the first place.
  const base = makeReceipt({});
  const receipt = {
    ...base,
    run_id: "customer.owner@example.com",
    raw_evidence_payload: { customer_payload: customerPayload, b: hostileBearer },
  };

  for (const tier of ["public", "subscriber", "owner"] as const) {
    const result = projectReceipt({ tier, receipt });
    assertProjectionFailure(result);
    deepEqual(result.errors, ["receipt failed verification"]);
    const serialized = JSON.stringify(result);
    ok(!serialized.includes(customerPayload));
    ok(!serialized.includes(hostileBearer));
  }
});

test("subscriber projection never surfaces non-private receipt body keys", () => {
  const receipt = makeReceipt({});
  const subscriberResult = projectReceipt({ tier: "subscriber", receipt });
  const publicResult = projectReceipt({ tier: "public", receipt });
  assertProjectionOk(subscriberResult);
  assertProjectionOk(publicResult);

  const keys = collectKeys([subscriberResult.projection, publicResult.projection]);
  for (const privateKey of ["semantic_diff", "hash_algorithm", "sig"]) {
    ok(!keys.has(privateKey));
  }
  const serialized = JSON.stringify([
    subscriberResult.projection,
    publicResult.projection,
  ]);
  ok(serialized.includes(receipt.content_hash));
  ok(serialized.includes(CONTRACT_FP));
});

test("subscriber projection fails closed when a shared fingerprint token is secret shaped", () => {
  // A secret-shaped fingerprint token would be surfaced verbatim in the
  // subscriber tier's full facet map — it must fail closed instead of leaking.
  const privateUrl =
    "https://policy.internal/freshness?token=secret1234567890";
  const receipt = makeReceipt({
    fingerprints: { "@atomic": ATOMIC_TOKEN, "leak": privateUrl },
  });

  const subscriberResult = projectReceipt({ tier: "subscriber", receipt });
  assertProjectionFailure(subscriberResult);
  deepEqual(subscriberResult.errors, [
    "projection would expose secret-shaped data",
  ]);
  ok(!JSON.stringify(subscriberResult).includes(privateUrl));

  // The public tier exposes only the facet *count*, never the tokens, so the
  // secret-shaped token cannot leak — it projects cleanly.
  const publicResult = projectReceipt({ tier: "public", receipt });
  assertProjectionOk(publicResult);
  ok(!JSON.stringify(publicResult).includes(privateUrl));

  // The owner tier is allowed to see the full (non-redacted) projection.
  const ownerResult = projectReceipt({ tier: "owner", receipt });
  assertProjectionOk(ownerResult);
  ok(JSON.stringify(ownerResult).includes(privateUrl));
});

test("projection failures never echo malformed private receipt data", () => {
  const customerPayload = "customer payload: sealed evidence beta";
  const base = makeReceipt({});
  // Tamper with the content_hash so verification fails; attach hostile data.
  const malformed = {
    ...base,
    content_hash:
      "sha256:0000000000000000000000000000000000000000000000000000000000000000",
    raw_evidence_payload: { customer_payload: customerPayload },
  };

  const result = projectReceipt({ tier: "public", receipt: malformed });
  assertProjectionFailure(result);
  deepEqual(result.errors, ["receipt failed verification"]);
  ok(!JSON.stringify(result).includes(customerPayload));
});

test("unknown projection tiers fail closed", () => {
  const receipt = makeReceipt({});

  deepEqual(projectReceipt({ tier: "partner", receipt }), {
    ok: false,
    tier: null,
    errors: ["unknown projection tier"],
    projection: null,
  });
});

test("projection public surface exposes the three tiers and the project functions", () => {
  equal(typeof projectReceipt, "function");
  equal(typeof projectReceiptProof, "function");
  deepEqual([...RECEIPT_PROJECTION_TIERS], ["owner", "subscriber", "public"]);
});

interface MakeReceiptOptions {
  readonly status?: "rendered" | "skipped" | "failed";
  readonly wakeSource?: WakeSource;
  readonly tokens?: { readonly fresh: number; readonly reused: number };
  readonly fingerprints?: Readonly<Record<string, string>>;
}

function makeReceipt(options: MakeReceiptOptions): LedgerReceipt {
  const wakeSource = options.wakeSource ?? "input";
  const input: Receipt = {
    node: "node.incident-briefing",
    contract_fingerprint: CONTRACT_FP,
    wake: { source: wakeSource, refs: [WAKE_REF] },
    input_fingerprints: [INPUT_FP],
    fingerprints: options.fingerprints ?? { "@atomic": ATOMIC_TOKEN },
    semantic_diff: {},
    prev: null,
    status: options.status ?? "rendered",
    cost: {
      provider: "cradle-double",
      model: "deterministic-replay",
      tokens: options.tokens ?? { fresh: 37, reused: 0 },
      surprise_cause: wakeSource,
    },
    sig: { scheme: "none", null_reason: "projection fixture" },
  };

  return createReceipt(input);
}

function assertProjectionOk(
  result: ReceiptProjectionResult,
): asserts result is Extract<ReceiptProjectionResult, { readonly ok: true }> {
  equal(result.ok, true);
}

function assertProjectionFailure(
  result: ReceiptProjectionResult,
): asserts result is Extract<ReceiptProjectionResult, { readonly ok: false }> {
  equal(result.ok, false);
}

function collectKeys(value: unknown): Set<string> {
  const keys = new Set<string>();
  visitKeys(value, keys);
  return keys;
}

function visitKeys(value: unknown, keys: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      visitKeys(item, keys);
    }
    return;
  }
  if (typeof value !== "object" || value === null) {
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    keys.add(key);
    visitKeys(item, keys);
  }
}
