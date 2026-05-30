// receipt/ — the single commit object and the unit of the ledger.
//
// RESHAPED to the ideal Receipt (SHAPES.md §4; architecture.md §6.1). The judge
// era (verdict.{status,confidence,blocked}, role:judge, freshness.*,
// composition.*, core.memo_key, V0 naming) is demolished (delta.md §A6, §C7;
// world-model.md §3 "do not reintroduce it").
//
// What is KEPT verbatim as machinery (delta.md §A3.2, lines 152-158):
//   - the deterministic sorted-key canonical serialization, and
//   - sha256 over that canonical form,
// re-pointed so the receipt's own `content_hash` is the *chain identity*
// (architecture.md §5.1: "each receipt commits to its fingerprints and its
// `prev`; verification is chain-consistency").
//
// The semantic shapes (Receipt, Wake, Cost, FingerprintMap, ReceiptStatus,
// ReceiptSignature, ContentAddress, …) are the foundation-wave canonical types
// from ../shapes; this module owns the *envelope*, *canonicalization*,
// *hashing*, *verification*, and *chain/proof inspection* over them.

import { createHash } from "node:crypto";

import {
  ATOMIC_FACET,
  EMPTY_SEMANTIC_DIFF,
  NULL_SIGNER_NOT_CONFIGURED_REASON,
  createNullSignature,
  type ContentAddress,
  type Cost,
  type Facet,
  type Fingerprint,
  type FingerprintMap,
  type InputFingerprints,
  type NullSignature,
  type Receipt,
  type ReceiptSignature,
  type ReceiptStatus,
  type SemanticDiff,
  type Wake,
  type WakeSource,
} from "../shapes/index";

export const RECEIPT_SCHEMA = "openprose.receipt" as const;
export const RECEIPT_HASH_ALGORITHM = "sha256" as const;

export type ReceiptSchema = typeof RECEIPT_SCHEMA;
export type ReceiptHashAlgorithm = typeof RECEIPT_HASH_ALGORITHM;

// Re-export the canonical signature null-state so callers building a receipt do
// not need to reach into ../shapes for the only honest v1 signer.
export { NULL_SIGNER_NOT_CONFIGURED_REASON, createNullSignature };

/**
 * The on-ledger receipt envelope. The body is the canonical `Receipt`
 * (SHAPES.md §4); the envelope adds the schema tag, the hash-algorithm tag, and
 * the receipt's own `content_hash` — the *chain identity* (architecture.md
 * §5.1; delta.md §A3.2 line 157: "the receipt's own content_hash survives as
 * chain identity"). `prev` lives on the `Receipt` body and points at the prior
 * envelope's `content_hash`.
 */
export interface LedgerReceipt extends Receipt {
  readonly schema: ReceiptSchema;
  readonly hash_algorithm: ReceiptHashAlgorithm;
  readonly content_hash: ContentAddress;
}

export type ReceiptHashPayload = Omit<LedgerReceipt, "content_hash">;

/**
 * The caller-supplied body — exactly the canonical `Receipt` fields. The
 * envelope (schema, hash_algorithm, content_hash) is stamped by createReceipt.
 */
export type ReceiptInput = Receipt;

const WAKE_SOURCES = new Set<WakeSource>(["input", "self", "external"]);
const RECEIPT_STATUSES = new Set<ReceiptStatus>([
  "rendered",
  "skipped",
  "failed",
]);

const CONTENT_ADDRESS_PATTERN = /^sha256:[a-f0-9]{64}$/;

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

/**
 * Stamp a canonical Receipt body into a verified ledger envelope. The
 * content_hash is the sha256 of the canonical serialization of the envelope
 * sans content_hash (kept machinery, delta.md §A3.2). Throws if the body is not
 * a valid ideal receipt.
 */
export function createReceipt(input: ReceiptInput): LedgerReceipt {
  const payload: ReceiptHashPayload = {
    schema: RECEIPT_SCHEMA,
    hash_algorithm: RECEIPT_HASH_ALGORITHM,
    node: input.node,
    contract_fingerprint: input.contract_fingerprint,
    wake: input.wake,
    input_fingerprints: input.input_fingerprints,
    fingerprints: input.fingerprints,
    semantic_diff: input.semantic_diff,
    prev: input.prev,
    status: input.status,
    cost: input.cost,
    sig: input.sig,
  };

  const receipt: LedgerReceipt = {
    ...payload,
    content_hash: computeReceiptContentHash(payload),
  };

  const verification = verifyReceipt(receipt);
  if (!verification.ok) {
    throw new Error(`Invalid receipt input: ${verification.errors.join("; ")}`);
  }

  return receipt;
}

/**
 * Build the canonical `skipped` receipt that copies the unchanged fingerprints
 * forward (architecture.md §8 dirty/coalesce; SHAPES.md §4: "A `skipped`
 * receipt copies the unchanged `fingerprints` forward, carries
 * EMPTY_SEMANTIC_DIFF, and zero cost"). Only `rendered` with a moved
 * fingerprint propagates (world-model.md §8 line 329-330).
 */
export function createSkippedReceipt(params: {
  readonly node: string;
  readonly contract_fingerprint: Fingerprint;
  readonly wake: Wake;
  readonly input_fingerprints: InputFingerprints;
  readonly fingerprints: FingerprintMap;
  readonly prev: ContentAddress | null;
  readonly cost?: Cost;
  readonly sig?: ReceiptSignature;
}): LedgerReceipt {
  return createReceipt({
    node: params.node,
    contract_fingerprint: params.contract_fingerprint,
    wake: params.wake,
    input_fingerprints: params.input_fingerprints,
    fingerprints: params.fingerprints,
    semantic_diff: EMPTY_SEMANTIC_DIFF,
    prev: params.prev,
    status: "skipped",
    cost:
      params.cost ??
      {
        provider: "none",
        model: "none",
        tokens: { fresh: 0, reused: 0 },
        surprise_cause: params.wake.source,
      },
    sig: params.sig ?? createNullSignature(),
  });
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

export type ReceiptVerificationResult =
  | { readonly ok: true; readonly content_hash: ContentAddress }
  | {
      readonly ok: false;
      readonly errors: readonly string[];
      readonly expected_content_hash?: ContentAddress;
      readonly actual_content_hash?: string;
    };

export function verifyReceipt(value: unknown): ReceiptVerificationResult {
  const errors: string[] = [];

  if (!isRecord(value)) {
    return { ok: false, errors: ["receipt must be an object"] };
  }

  validateReceiptShape(value, errors);

  let expectedContentHash: ContentAddress | undefined;
  try {
    expectedContentHash = computeReceiptContentHash(
      value as LedgerReceipt | ReceiptHashPayload,
    );
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "content hash failed");
  }

  const actualContentHash = value["content_hash"];
  if (typeof actualContentHash !== "string") {
    errors.push("content_hash must be a sha256 content address");
  } else if (!CONTENT_ADDRESS_PATTERN.test(actualContentHash)) {
    errors.push("content_hash must use sha256:<64 lowercase hex>");
  } else if (
    expectedContentHash !== undefined &&
    actualContentHash !== expectedContentHash
  ) {
    errors.push("content_hash does not match canonical receipt payload");
  }

  if (errors.length > 0) {
    const failure: {
      readonly ok: false;
      readonly errors: readonly string[];
      readonly expected_content_hash?: ContentAddress;
      readonly actual_content_hash?: string;
    } = { ok: false, errors };

    return {
      ...failure,
      ...(expectedContentHash === undefined
        ? {}
        : { expected_content_hash: expectedContentHash }),
      ...(typeof actualContentHash === "string"
        ? { actual_content_hash: actualContentHash }
        : {}),
    };
  }

  return { ok: true, content_hash: actualContentHash as ContentAddress };
}

export function assertReceipt(value: unknown): asserts value is LedgerReceipt {
  const verification = verifyReceipt(value);
  if (!verification.ok) {
    throw new Error(`Invalid receipt: ${verification.errors.join("; ")}`);
  }
}

// ---------------------------------------------------------------------------
// Chain helpers (the ledger is a `prev`-linked chain of content addresses)
// ---------------------------------------------------------------------------

export type ReceiptChainResult =
  | { readonly ok: true; readonly head: ContentAddress | null; readonly length: number }
  | { readonly ok: false; readonly errors: readonly string[] };

/**
 * Verify a node-scoped ledger slice is a well-formed `prev`-linked chain
 * (architecture.md §5.1: each receipt "commits to its fingerprints and its
 * `prev`; verification is chain-consistency"). `chain[0]` is the cold-start
 * receipt (`prev: null`); each subsequent `prev` must equal the predecessor's
 * `content_hash`, and every receipt must share the same `node`.
 */
export function verifyReceiptChain(
  chain: readonly unknown[],
): ReceiptChainResult {
  const errors: string[] = [];

  if (chain.length === 0) {
    return { ok: true, head: null, length: 0 };
  }

  let node: string | undefined;
  let prevHash: ContentAddress | null = null;

  for (const [index, value] of chain.entries()) {
    const verification = verifyReceipt(value);
    if (!verification.ok) {
      errors.push(`chain[${index}] is not a valid receipt: ${verification.errors.join("; ")}`);
      continue;
    }
    const receipt = value as LedgerReceipt;

    if (node === undefined) {
      node = receipt.node;
    } else if (receipt.node !== node) {
      errors.push(`chain[${index}].node "${receipt.node}" breaks node-scoped ledger "${node}"`);
    }

    const expectedPrev: ContentAddress | null = index === 0 ? null : prevHash;
    if (receipt.prev !== expectedPrev) {
      errors.push(
        `chain[${index}].prev must be ${expectedPrev === null ? "null (cold start)" : expectedPrev} to chain the ledger`,
      );
    }

    prevHash = verification.content_hash;
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, head: prevHash, length: chain.length };
}

// ---------------------------------------------------------------------------
// Canonicalization + hashing (kept machinery, re-pointed — delta.md §A3.2)
// ---------------------------------------------------------------------------

export function serializeReceipt(receipt: LedgerReceipt): string {
  assertReceipt(receipt);
  return canonicalizeForReceipt(receipt);
}

export function computeReceiptContentHash(
  value: LedgerReceipt | ReceiptHashPayload,
): ContentAddress {
  const payload = withoutContentHash(value);
  return hashCanonicalReceipt(canonicalizeForReceipt(payload));
}

export function canonicalizeForReceipt(value: unknown): string {
  return renderCanonical(value);
}

export function hashCanonicalReceipt(canonical: string): ContentAddress {
  return `sha256:${createHash("sha256").update(canonical).digest("hex")}`;
}

// ---------------------------------------------------------------------------
// Proof inspection (shareable, non-secret summary — feeds projection/)
// ---------------------------------------------------------------------------

export interface ReceiptSignerPostureInspection {
  readonly kind: "null" | "signed";
  readonly scheme: string;
}

export interface ReceiptCostInspection {
  readonly fresh: number | null;
  readonly reused: number | null;
  readonly provider: string | null;
  readonly model: string | null;
  readonly surprise_cause: string | null;
}

export interface ReceiptProofInspection {
  readonly ok: boolean;
  readonly errors: readonly string[];
  readonly schema: string | null;
  readonly content_hash: ContentAddress | null;
  readonly node: string | null;
  readonly contract_fingerprint: string | null;
  readonly wake_source: string | null;
  readonly status: string | null;
  readonly input_fingerprint_count: number;
  readonly facet_count: number;
  readonly has_atomic_facet: boolean;
  readonly prev: ContentAddress | null;
  readonly signer: ReceiptSignerPostureInspection | null;
  readonly cost: ReceiptCostInspection;
}

export function inspectReceiptProof(value: unknown): ReceiptProofInspection {
  const verification = verifyReceipt(value);
  const receipt = isRecord(value) ? value : undefined;
  const fingerprints = readRecord(receipt, "fingerprints");
  const inputFingerprints = receipt?.["input_fingerprints"];
  const wake = readRecord(receipt, "wake");

  return {
    ok: verification.ok,
    errors: verification.ok ? [] : verification.errors,
    schema: readString(receipt, "schema"),
    content_hash: verification.ok ? verification.content_hash : null,
    node: readString(receipt, "node"),
    contract_fingerprint: readString(receipt, "contract_fingerprint"),
    wake_source: readString(wake, "source"),
    status: readString(receipt, "status"),
    input_fingerprint_count: Array.isArray(inputFingerprints)
      ? inputFingerprints.length
      : 0,
    facet_count: fingerprints === undefined ? 0 : Object.keys(fingerprints).length,
    has_atomic_facet:
      fingerprints !== undefined &&
      typeof fingerprints[ATOMIC_FACET] === "string",
    prev: readContentAddress(receipt, "prev"),
    signer: inspectSigner(readRecord(receipt, "sig")),
    cost: inspectCost(readRecord(receipt, "cost")),
  };
}

function inspectSigner(
  sig: Readonly<Record<string, unknown>> | undefined,
): ReceiptSignerPostureInspection | null {
  const scheme = readString(sig, "scheme");
  if (scheme === null || scheme.length === 0) {
    return null;
  }
  return scheme === "none"
    ? { kind: "null", scheme }
    : { kind: "signed", scheme };
}

function inspectCost(
  cost: Readonly<Record<string, unknown>> | undefined,
): ReceiptCostInspection {
  const tokens = readRecord(cost, "tokens");
  return {
    fresh: readNumber(tokens, "fresh"),
    reused: readNumber(tokens, "reused"),
    provider: readString(cost, "provider"),
    model: readString(cost, "model"),
    surprise_cause: readString(cost, "surprise_cause"),
  };
}

// ---------------------------------------------------------------------------
// Shape validation
// ---------------------------------------------------------------------------

function validateReceiptShape(
  receipt: Readonly<Record<string, unknown>>,
  errors: string[],
): void {
  validateExactKeys(
    receipt,
    "receipt",
    [
      "schema",
      "hash_algorithm",
      "content_hash",
      "node",
      "contract_fingerprint",
      "wake",
      "input_fingerprints",
      "fingerprints",
      "semantic_diff",
      "prev",
      "status",
      "cost",
      "sig",
    ],
    errors,
  );
  expectLiteral(receipt, "schema", RECEIPT_SCHEMA, "receipt", errors);
  expectLiteral(receipt, "hash_algorithm", RECEIPT_HASH_ALGORITHM, "receipt", errors);

  expectNonEmptyString(receipt, "node", "receipt", errors);
  expectNonEmptyString(receipt, "contract_fingerprint", "receipt", errors);
  expectEnum(receipt, "status", "receipt", RECEIPT_STATUSES, errors);

  const wake = expectRecord(receipt, "wake", "receipt", errors);
  if (wake !== undefined) {
    validateWake(wake, errors);
  }

  expectFingerprintArray(receipt, "input_fingerprints", "receipt", errors);

  const fingerprints = expectRecord(receipt, "fingerprints", "receipt", errors);
  if (fingerprints !== undefined) {
    validateFingerprintMap(fingerprints, errors);
  }

  validateSemanticDiff(receipt, errors);
  validatePrev(receipt, errors);

  const sig = expectRecord(receipt, "sig", "receipt", errors);
  if (sig !== undefined) {
    validateSignature(sig, errors);
  }

  const cost = expectRecord(receipt, "cost", "receipt", errors);
  if (cost !== undefined) {
    validateCost(cost, errors);
  }

  // Cross-field invariants tying the receipt together (SHAPES.md §4).
  if (wake !== undefined && cost !== undefined) {
    expectSameString(
      "cost.surprise_cause",
      cost["surprise_cause"],
      "wake.source",
      wake["source"],
      errors,
    );
  }

  // A skipped receipt carries the empty semantic diff and zero cost
  // (SHAPES.md §4; architecture.md §8).
  if (receipt["status"] === "skipped") {
    const diff = receipt["semantic_diff"];
    if (isRecord(diff) && Object.keys(diff).length !== 0) {
      errors.push("skipped receipt must carry the empty semantic_diff");
    }
    if (cost !== undefined) {
      const tokens = readRecord(cost, "tokens");
      if ((readNumber(tokens, "fresh") ?? 0) !== 0) {
        errors.push("skipped receipt must carry zero fresh tokens");
      }
    }
  }
}

function validateWake(
  wake: Readonly<Record<string, unknown>>,
  errors: string[],
): void {
  validateExactKeys(wake, "wake", ["source", "refs"], errors);
  expectEnum(wake, "source", "wake", WAKE_SOURCES, errors);
  expectContentAddressArray(wake, "refs", "wake", errors);
}

function validateFingerprintMap(
  fingerprints: Readonly<Record<string, unknown>>,
  errors: string[],
): void {
  const keys = Object.keys(fingerprints);
  if (!Object.hasOwn(fingerprints, ATOMIC_FACET)) {
    errors.push(`fingerprints must always include the reserved "${ATOMIC_FACET}" facet`);
  }
  for (const key of keys) {
    const value = fingerprints[key];
    if (typeof value !== "string" || value.length === 0) {
      errors.push(`fingerprints.${key} must be a non-empty fingerprint token`);
    }
  }
}

function validateSemanticDiff(
  receipt: Readonly<Record<string, unknown>>,
  errors: string[],
): void {
  const diff = receipt["semantic_diff"];
  if (!isRecord(diff)) {
    errors.push("semantic_diff must be an object (render-input context map)");
  }
}

function validatePrev(
  receipt: Readonly<Record<string, unknown>>,
  errors: string[],
): void {
  const prev = receipt["prev"];
  if (prev === null) {
    return;
  }
  if (typeof prev !== "string" || !CONTENT_ADDRESS_PATTERN.test(prev)) {
    errors.push("prev must be null (cold start) or a sha256 content address");
  }
}

function validateSignature(
  sig: Readonly<Record<string, unknown>>,
  errors: string[],
): void {
  const scheme = sig["scheme"];
  if (scheme === "none") {
    validateExactKeys(sig, "sig", ["scheme", "null_reason"], errors);
    expectNonEmptyString(sig, "null_reason", "sig", errors);
    return;
  }
  // The null signer is the only honest v1 state (world-model.md §5; SHAPES.md
  // §4: `ReceiptSignature = NullSignature`). Non-null returns with the deferred
  // crypto milestone (architecture.md §9).
  errors.push(
    'sig.scheme must be "none"; the null signer is the only honest v1 state',
  );
}

function validateCost(
  cost: Readonly<Record<string, unknown>>,
  errors: string[],
): void {
  // The receipt requires the architecture.md §6.1 core of Cost. The cost/
  // module's superset MAY add fields (delta.md §A4), so extra keys are allowed
  // here, but tokens + surprise_cause + provider + model are load-bearing.
  expectNonEmptyString(cost, "provider", "cost", errors);
  expectNonEmptyString(cost, "model", "cost", errors);
  expectEnum(cost, "surprise_cause", "cost", WAKE_SOURCES, errors);

  const tokens = expectRecord(cost, "tokens", "cost", errors);
  if (tokens !== undefined) {
    expectNonNegativeInteger(tokens, "fresh", "cost.tokens", errors);
    expectNonNegativeInteger(tokens, "reused", "cost.tokens", errors);
  }
}

// ---------------------------------------------------------------------------
// Primitive readers + canonicalizer (kept verbatim machinery)
// ---------------------------------------------------------------------------

function readRecord(
  record: Readonly<Record<string, unknown>> | undefined,
  key: string,
): Readonly<Record<string, unknown>> | undefined {
  const value = record?.[key];
  return isRecord(value) ? value : undefined;
}

function readString(
  record: Readonly<Record<string, unknown>> | undefined,
  key: string,
): string | null {
  const value = record?.[key];
  return typeof value === "string" ? value : null;
}

function readNumber(
  record: Readonly<Record<string, unknown>> | undefined,
  key: string,
): number | null {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readContentAddress(
  record: Readonly<Record<string, unknown>> | undefined,
  key: string,
): ContentAddress | null {
  const value = readString(record, key);
  return value !== null && CONTENT_ADDRESS_PATTERN.test(value)
    ? (value as ContentAddress)
    : null;
}

function withoutContentHash(
  value: LedgerReceipt | ReceiptHashPayload,
): ReceiptHashPayload {
  const { content_hash: _contentHash, ...payload } = value as LedgerReceipt;
  return payload;
}

function validateExactKeys(
  record: Readonly<Record<string, unknown>>,
  path: string,
  allowedKeys: readonly string[],
  errors: string[],
): void {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      errors.push(`${path}.${key} is not pinned in the receipt shape`);
    }
  }
}

function expectLiteral(
  record: Readonly<Record<string, unknown>>,
  key: string,
  value: unknown,
  path: string,
  errors: string[],
): void {
  if (record[key] !== value) {
    errors.push(`${path}.${key} must be ${JSON.stringify(value)}`);
  }
}

function expectRecord(
  record: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
  errors: string[],
): Readonly<Record<string, unknown>> | undefined {
  const value = record[key];
  if (!isRecord(value)) {
    errors.push(`${path}.${key} must be an object`);
    return undefined;
  }
  return value;
}

function expectNonEmptyString(
  record: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
  errors: string[],
): void {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    errors.push(`${path}.${key} must be a non-empty string`);
  }
}

function expectFingerprintArray(
  record: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
  errors: string[],
): void {
  const value = record[key];
  if (!Array.isArray(value)) {
    errors.push(`${path}.${key} must be an array of fingerprint tokens`);
    return;
  }
  for (const [index, item] of value.entries()) {
    if (typeof item !== "string" || item.length === 0) {
      errors.push(`${path}.${key}[${index}] must be a non-empty fingerprint token`);
    }
  }
}

function expectContentAddressArray(
  record: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
  errors: string[],
): void {
  const value = record[key];
  if (!Array.isArray(value)) {
    errors.push(`${path}.${key} must be an array of sha256 content addresses`);
    return;
  }
  for (const [index, item] of value.entries()) {
    if (typeof item !== "string" || !CONTENT_ADDRESS_PATTERN.test(item)) {
      errors.push(`${path}.${key}[${index}] must use sha256:<64 lowercase hex>`);
    }
  }
}

function expectEnum<T extends string>(
  record: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
  allowed: ReadonlySet<T>,
  errors: string[],
): void {
  const value = record[key];
  if (typeof value !== "string" || !allowed.has(value as T)) {
    errors.push(`${path}.${key} must be one of ${Array.from(allowed).join(", ")}`);
  }
}

function expectNonNegativeInteger(
  record: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
  errors: string[],
): void {
  const value = record[key];
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    errors.push(`${path}.${key} must be a non-negative safe integer`);
  }
}

function expectSameString(
  leftPath: string,
  left: unknown,
  rightPath: string,
  right: unknown,
  errors: string[],
): void {
  if (typeof left === "string" && typeof right === "string" && left !== right) {
    errors.push(`${leftPath} must match ${rightPath}`);
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function renderCanonical(value: unknown): string {
  if (value === null) {
    return "null";
  }

  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value)) {
        throw new TypeError("Cannot canonicalize non-finite numbers");
      }
      return JSON.stringify(value);
    case "string":
      return JSON.stringify(value);
    case "object":
      if (Array.isArray(value)) {
        return `[${value.map((item) => renderCanonical(item)).join(",")}]`;
      }
      if (!isRecord(value)) {
        throw new TypeError("Cannot canonicalize non-plain objects");
      }
      return renderCanonicalObject(value);
    case "undefined":
    case "bigint":
    case "function":
    case "symbol":
      throw new TypeError(`Cannot canonicalize ${typeof value}`);
  }

  throw new TypeError("Cannot canonicalize unknown value");
}

function renderCanonicalObject(
  value: Readonly<Record<string, unknown>>,
): string {
  const fields: string[] = [];
  for (const key of Object.keys(value).sort()) {
    const item = value[key];
    if (item === undefined) {
      throw new TypeError(`Cannot canonicalize undefined field ${key}`);
    }
    fields.push(`${JSON.stringify(key)}:${renderCanonical(item)}`);
  }
  return `{${fields.join(",")}}`;
}

// Re-export the canonical shape types so downstream modules can import receipt
// surface + shapes from one place without reaching across modules.
export type {
  ContentAddress,
  Cost,
  Facet,
  Fingerprint,
  FingerprintMap,
  InputFingerprints,
  NullSignature,
  Receipt,
  ReceiptSignature,
  ReceiptStatus,
  SemanticDiff,
  Wake,
  WakeSource,
};
