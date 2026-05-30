// projection/ — owner / subscriber / public receipt projection + secret
// redaction. The shareable-trust tiers (plan.md "trust is demonstrated, not
// asserted").
//
// KEPT (delta.md §A4 L198-201) but re-pointed onto the ideal Receipt: a
// projection is a DERIVED VIEW of a receipt, never truth (SHAPES.md §0 invariant
// 3: "SQL / vector / dashboards are derived projections, never the truth"). The
// judge era — verdict.{status,confidence,blocked}, role, freshness.*,
// composition pins, contract_revision — is demolished (delta.md §A6). The new
// projectable surface is the ideal receipt's own fields (architecture.md §6.1):
// node, contract_fingerprint, wake, input_fingerprints, fingerprints (the
// published-truth facet map), status (render outcome), cost, sig.
//
// Redaction posture is preserved: public/subscriber tiers fail closed if a
// public field would carry secret-shaped data or a known-private key.

import {
  inspectReceiptProof,
  type ContentAddress,
  type ReceiptProofInspection,
} from "../receipt";
import { ATOMIC_FACET } from "../shapes";

export const RECEIPT_PROJECTION_SCHEMA =
  "openprose.receipt.projection" as const;
export const RECEIPT_PROJECTION_VERSION = 1 as const;
export const RECEIPT_PROJECTION_TIERS = [
  "owner",
  "subscriber",
  "public",
] as const;

export type ReceiptProjectionSchema = typeof RECEIPT_PROJECTION_SCHEMA;
export type ReceiptProjectionVersion = typeof RECEIPT_PROJECTION_VERSION;
export type ReceiptProjectionTier = (typeof RECEIPT_PROJECTION_TIERS)[number];

export interface ProjectReceiptInput {
  readonly tier: string;
  readonly receipt: unknown;
}

export interface ProjectReceiptProofInput {
  readonly tier: string;
  readonly proof: unknown;
}

export type ReceiptProjectionSigner =
  | {
      readonly kind: "null";
      readonly scheme: "none";
    }
  | {
      readonly kind: "signed";
      readonly scheme: string;
    };

/**
 * The wake projection: source + how many waking-receipt refs there were. The
 * refs themselves (content addresses) are not surfaced — the *attribution* is the
 * source, not the upstream identity (world-model.md §5).
 */
export interface ReceiptWakeProjection {
  readonly source: string;
  /** Count of waking-receipt refs; `null` when projected from a proof summary
   * (which carries the wake source but not its refs). */
  readonly ref_count: number | null;
}

/**
 * The published-truth facet projection. The public tier exposes only the *shape*
 * of the truth (how many facets, whether the atomic facet is present) — never the
 * facet names or tokens, since a proof summary carries only counts and a facet
 * name may itself be sensitive. Subscriber/owner get the full `{ facet → token }`
 * map (a fingerprint is a meaning-layer trust token, safe to share downstream).
 */
export interface ReceiptPublicFingerprintProjection {
  readonly facet_count: number;
  readonly atomic_facet_present: boolean;
}

export interface ReceiptSubscriberFingerprintProjection {
  readonly facets: readonly string[];
  readonly atomic_facet_present: boolean;
  readonly fingerprints: Readonly<Record<string, string>>;
}

/**
 * The cost projection — "cost scales with surprise" made shareable (delta.md
 * §A4). public exposes the token split + surprise cause; subscriber adds the
 * provider/model attribution.
 */
export interface ReceiptPublicCostProjection {
  readonly fresh: number;
  readonly reused: number;
  readonly surprise_cause: string;
}

export interface ReceiptSubscriberCostProjection
  extends ReceiptPublicCostProjection {
  readonly provider: string;
  readonly model: string;
}

export interface ReceiptProjectionBase {
  readonly schema: ReceiptProjectionSchema;
  readonly v: ReceiptProjectionVersion;
  readonly tier: ReceiptProjectionTier;
  readonly receipt_id: ContentAddress;
  readonly content_hash: ContentAddress;
  readonly contract_fingerprint: string;
  readonly status: string;
  readonly wake: ReceiptWakeProjection;
  readonly signer: ReceiptProjectionSigner;
}

export interface ReceiptOwnerProjection extends ReceiptProjectionBase {
  readonly tier: "owner";
  readonly node: string;
  readonly input_fingerprints: readonly string[];
  readonly fingerprints: ReceiptSubscriberFingerprintProjection;
  readonly cost: ReceiptSubscriberCostProjection;
  readonly prev: ContentAddress | null;
  readonly proof: ReceiptProofInspection;
}

export interface ReceiptSubscriberProjection extends ReceiptProjectionBase {
  readonly tier: "subscriber";
  readonly node: string;
  readonly input_fingerprints: readonly string[];
  readonly fingerprints: ReceiptSubscriberFingerprintProjection;
  readonly cost: ReceiptSubscriberCostProjection;
}

export interface ReceiptPublicProjection extends ReceiptProjectionBase {
  readonly tier: "public";
  readonly fingerprints: ReceiptPublicFingerprintProjection;
  readonly cost: ReceiptPublicCostProjection;
  readonly input_fingerprint_count: number;
}

export type ReceiptProjection =
  | ReceiptOwnerProjection
  | ReceiptSubscriberProjection
  | ReceiptPublicProjection;

export type ReceiptProjectionResult =
  | {
      readonly ok: true;
      readonly tier: ReceiptProjectionTier;
      readonly projection: ReceiptProjection;
    }
  | {
      readonly ok: false;
      readonly tier: ReceiptProjectionTier | null;
      readonly errors: readonly string[];
      readonly projection: null;
    };

/**
 * The summary that *every* source yields: a verified proof inspection carries
 * counts (facet_count, input_fingerprint_count) but not the raw facet map. It is
 * sufficient for the public tier.
 */
interface NormalizedSummary {
  readonly inspection: ReceiptProofInspection;
  readonly content_hash: ContentAddress;
  readonly node: string;
  readonly contract_fingerprint: string;
  readonly status: string;
  readonly wake: ReceiptWakeProjection;
  readonly signer: ReceiptProjectionSigner;
  readonly facet_count: number;
  readonly atomic_facet_present: boolean;
  readonly input_fingerprint_count: number;
  readonly cost: ReceiptSubscriberCostProjection;
  readonly prev: ContentAddress | null;
}

/**
 * The full view — only available from a raw receipt (the proof summary does not
 * carry the raw facet map or the input-fingerprint tuple). Required for the
 * subscriber/owner tiers.
 */
interface NormalizedFull extends NormalizedSummary {
  readonly fingerprints: Readonly<Record<string, string>>;
  readonly facets: readonly string[];
  readonly input_fingerprints: readonly string[];
}

const CONTENT_ADDRESS_PATTERN = /^sha256:[a-f0-9]{64}$/;
const PROJECTION_TIERS = new Set<string>(RECEIPT_PROJECTION_TIERS);
const ALLOWED_STATUSES = new Set<string>(["rendered", "skipped", "failed"]);
const ALLOWED_WAKE_SOURCES = new Set<string>(["input", "self", "external"]);
const ALLOWED_SURPRISE_CAUSES = new Set<string>(["input", "self", "external"]);
const OPENROUTER_SECRET_PREFIX = ["sk", "or"].join("-");
const PRIVATE_OUTPUT_KEYS = new Set([
  "customer_payload",
  "evidence_payload",
  "memo_key",
  "provider_norm",
  "rationale",
  "raw_evidence",
  "raw_evidence_payload",
  "run_id",
  "semantic_diff",
  "tags",
]);
const SECRET_SHAPED_PATTERNS = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /\bBearer\s+[A-Za-z0-9._-]{8,}\b/i,
  new RegExp(
    `\\b${escapeRegex(OPENROUTER_SECRET_PREFIX)}-[A-Za-z0-9._-]{8,}\\b`,
  ),
  /\bapi[_-]?key[_:/= -]+[A-Za-z0-9._-]{8,}\b/i,
  /\b(?:secret|token|password|credential|authorization)[_:/= -]+[A-Za-z0-9._-]{8,}\b/i,
  /\bhttps?:\/\/(?:localhost|127(?:\.\d{1,3}){3}|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2}|[^/\s?#]+(?:\.internal|\.local))(?::\d+)?(?:[/?#][^\s]*)?/i,
  /\bhttps?:\/\/[^\s?#]+[/?#][^\s]*(?:token|secret|signature|credential|password)=/i,
];

export function projectReceipt(
  input: ProjectReceiptInput,
): ReceiptProjectionResult {
  const tier = normalizeTier(input.tier);
  if (tier === null) {
    return failProjection(null, ["unknown projection tier"]);
  }

  const inspection = inspectReceiptProof(input.receipt);
  if (!inspection.ok) {
    return failProjection(tier, ["receipt failed verification"]);
  }

  const summary = normalizeSummary(inspection);
  if (!summary.ok) {
    return failProjection(tier, summary.errors);
  }

  // A raw receipt carries its wake refs, so enrich the summary's ref_count even
  // for the public tier (the proof-only path leaves it null).
  const refErrors: string[] = [];
  const refCount = readWakeRefCount(input.receipt, refErrors);
  const enriched: NormalizedSummary =
    refCount === null
      ? summary.summary
      : {
          ...summary.summary,
          wake: { source: summary.summary.wake.source, ref_count: refCount },
        };

  if (tier === "public") {
    return projectPublic(enriched);
  }

  const full = normalizeFull(enriched, input.receipt);
  if (!full.ok) {
    return failProjection(tier, full.errors);
  }

  return projectFull(tier, full.full);
}

/**
 * Project from a verified proof *summary* (inspectReceiptProof output). A proof
 * summary carries counts, not the raw facet map, so it can only yield the public
 * tier — the shareable-trust view (plan.md "trust is demonstrated"). Asking for a
 * richer tier from a summary fails closed.
 */
export function projectReceiptProof(
  input: ProjectReceiptProofInput,
): ReceiptProjectionResult {
  const tier = normalizeTier(input.tier);
  if (tier === null) {
    return failProjection(null, ["unknown projection tier"]);
  }
  if (tier !== "public") {
    return failProjection(tier, [
      "a proof summary can only be projected to the public tier",
    ]);
  }

  if (!isRecord(input.proof) || input.proof["ok"] !== true) {
    return failProjection(tier, ["receipt proof must be verified"]);
  }

  const summary = normalizeSummary(input.proof as unknown as ReceiptProofInspection);
  if (!summary.ok) {
    return failProjection(tier, summary.errors);
  }

  return projectPublic(summary.summary);
}

function projectPublic(summary: NormalizedSummary): ReceiptProjectionResult {
  const projection: ReceiptPublicProjection = {
    ...projectionBase("public", summary),
    tier: "public",
    fingerprints: {
      facet_count: summary.facet_count,
      atomic_facet_present: summary.atomic_facet_present,
    },
    cost: {
      fresh: summary.cost.fresh,
      reused: summary.cost.reused,
      surprise_cause: summary.cost.surprise_cause,
    },
    input_fingerprint_count: summary.input_fingerprint_count,
  };

  if (hasPublicProjectionLeak(projection)) {
    return failProjection("public", [
      "projection would expose secret-shaped data",
    ]);
  }

  return { ok: true, tier: "public", projection };
}

function projectFull(
  tier: "owner" | "subscriber",
  full: NormalizedFull,
): ReceiptProjectionResult {
  const fingerprints: ReceiptSubscriberFingerprintProjection = {
    facets: full.facets,
    atomic_facet_present: full.atomic_facet_present,
    fingerprints: full.fingerprints,
  };

  const projection: ReceiptProjection =
    tier === "owner"
      ? {
          ...projectionBase("owner", full),
          tier: "owner",
          node: full.node,
          input_fingerprints: full.input_fingerprints,
          fingerprints,
          cost: full.cost,
          prev: full.prev,
          proof: full.inspection,
        }
      : {
          ...projectionBase("subscriber", full),
          tier: "subscriber",
          node: full.node,
          input_fingerprints: full.input_fingerprints,
          fingerprints,
          cost: full.cost,
        };

  if (tier === "subscriber" && hasPublicProjectionLeak(projection)) {
    return failProjection("subscriber", [
      "projection would expose secret-shaped data",
    ]);
  }

  return { ok: true, tier, projection };
}

function projectionBase(
  tier: ReceiptProjectionTier,
  summary: NormalizedSummary,
): ReceiptProjectionBase {
  return {
    schema: RECEIPT_PROJECTION_SCHEMA,
    v: RECEIPT_PROJECTION_VERSION,
    tier,
    receipt_id: summary.content_hash,
    content_hash: summary.content_hash,
    contract_fingerprint: summary.contract_fingerprint,
    status: summary.status,
    wake: summary.wake,
    signer: summary.signer,
  };
}

function normalizeTier(tier: string): ReceiptProjectionTier | null {
  return PROJECTION_TIERS.has(tier) ? (tier as ReceiptProjectionTier) : null;
}

function normalizeSummary(
  inspection: ReceiptProofInspection,
):
  | { readonly ok: true; readonly summary: NormalizedSummary }
  | { readonly ok: false; readonly errors: readonly string[] } {
  const errors: string[] = [];

  const contentHash = assertContentAddress(
    inspection.content_hash,
    "content_hash",
    errors,
  );
  const node = assertNonEmptyString(inspection.node, "node", errors);
  const contractFingerprint = assertNonEmptyString(
    inspection.contract_fingerprint,
    "contract_fingerprint",
    errors,
  );
  const status = assertEnum(inspection.status, ALLOWED_STATUSES, "status", errors);
  const wakeSource = assertEnum(
    inspection.wake_source,
    ALLOWED_WAKE_SOURCES,
    "wake_source",
    errors,
  );
  const signer = normalizeSigner(inspection.signer, errors);
  const cost = normalizeCost(inspection, errors);

  if (
    errors.length > 0 ||
    contentHash === null ||
    node === null ||
    contractFingerprint === null ||
    status === null ||
    wakeSource === null ||
    signer === null ||
    cost === null
  ) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    summary: {
      inspection,
      content_hash: contentHash,
      node,
      contract_fingerprint: contractFingerprint,
      status,
      wake: { source: wakeSource, ref_count: null },
      signer,
      facet_count: inspection.facet_count,
      atomic_facet_present: inspection.has_atomic_facet,
      input_fingerprint_count: inspection.input_fingerprint_count,
      cost,
      prev: inspection.prev,
    },
  };
}

function normalizeFull(
  summary: NormalizedSummary,
  raw: unknown,
):
  | { readonly ok: true; readonly full: NormalizedFull }
  | { readonly ok: false; readonly errors: readonly string[] } {
  const errors: string[] = [];

  const refCount = readWakeRefCount(raw, errors);
  const fingerprints = readFingerprintMap(raw, errors);
  const inputFingerprints = readInputFingerprints(raw, errors);

  if (
    errors.length > 0 ||
    refCount === null ||
    fingerprints === null ||
    inputFingerprints === null
  ) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    full: {
      ...summary,
      wake: { source: summary.wake.source, ref_count: refCount },
      fingerprints,
      facets: Object.keys(fingerprints).sort(),
      input_fingerprints: inputFingerprints,
    },
  };
}

function readWakeRefCount(raw: unknown, errors: string[]): number | null {
  const receipt = isRecord(raw) ? raw : undefined;
  const wake = readRecord(receipt, "wake");
  const refs = wake?.["refs"];
  if (!Array.isArray(refs) || refs.some((ref) => typeof ref !== "string")) {
    errors.push("wake is malformed");
    return null;
  }

  return refs.length;
}

function normalizeSigner(
  value: ReceiptProofInspection["signer"],
  errors: string[],
): ReceiptProjectionSigner | null {
  if (value === null) {
    errors.push("signer is malformed");
    return null;
  }
  if (value.kind === "null" && value.scheme === "none") {
    return { kind: "null", scheme: "none" };
  }
  if (value.kind === "signed" && value.scheme !== "none") {
    return { kind: "signed", scheme: value.scheme };
  }

  errors.push("signer is malformed");
  return null;
}

function readFingerprintMap(
  raw: unknown,
  errors: string[],
): Readonly<Record<string, string>> | null {
  const receipt = isRecord(raw) ? raw : undefined;
  const fingerprints = readRecord(receipt, "fingerprints");
  if (fingerprints === undefined) {
    errors.push("fingerprints is malformed");
    return null;
  }

  const entries: Record<string, string> = {};
  for (const [facet, token] of Object.entries(fingerprints)) {
    if (typeof token !== "string" || token.length === 0) {
      errors.push("fingerprints is malformed");
      return null;
    }
    entries[facet] = token;
  }

  if (!Object.hasOwn(entries, ATOMIC_FACET)) {
    errors.push("fingerprints is malformed");
    return null;
  }

  return entries;
}

function readInputFingerprints(
  raw: unknown,
  errors: string[],
): readonly string[] | null {
  const receipt = isRecord(raw) ? raw : undefined;
  const value = receipt?.["input_fingerprints"];
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string" || item.length === 0)
  ) {
    errors.push("input_fingerprints is malformed");
    return null;
  }

  return value as readonly string[];
}

function normalizeCost(
  inspection: ReceiptProofInspection,
  errors: string[],
): ReceiptSubscriberCostProjection | null {
  const { fresh, reused, provider, model, surprise_cause } = inspection.cost;
  if (
    fresh === null ||
    reused === null ||
    !Number.isInteger(fresh) ||
    !Number.isInteger(reused) ||
    fresh < 0 ||
    reused < 0
  ) {
    errors.push("cost tokens are malformed");
    return null;
  }
  if (provider === null || provider.length === 0) {
    errors.push("cost provider is malformed");
    return null;
  }
  if (model === null || model.length === 0) {
    errors.push("cost model is malformed");
    return null;
  }
  if (surprise_cause === null || !ALLOWED_SURPRISE_CAUSES.has(surprise_cause)) {
    errors.push("cost surprise_cause is malformed");
    return null;
  }

  return { fresh, reused, provider, model, surprise_cause };
}

function hasPublicProjectionLeak(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(hasPublicProjectionLeak);
  }
  if (isRecord(value)) {
    return Object.entries(value).some(
      ([key, item]) =>
        isForbiddenOutputKey(key) || hasPublicProjectionLeak(item),
    );
  }
  return typeof value === "string" && hasSecretShapedText(value);
}

function isForbiddenOutputKey(key: string): boolean {
  return PRIVATE_OUTPUT_KEYS.has(key.toLowerCase());
}

function hasSecretShapedText(value: string): boolean {
  return SECRET_SHAPED_PATTERNS.some((pattern) => pattern.test(value));
}

function failProjection(
  tier: ReceiptProjectionTier | null,
  errors: readonly string[],
): ReceiptProjectionResult {
  return { ok: false, tier, errors, projection: null };
}

function assertContentAddress(
  value: string | null,
  label: string,
  errors: string[],
): ContentAddress | null {
  if (value === null || !CONTENT_ADDRESS_PATTERN.test(value)) {
    errors.push(`${label} is malformed`);
    return null;
  }

  return value as ContentAddress;
}

function assertNonEmptyString(
  value: string | null,
  label: string,
  errors: string[],
): string | null {
  if (value === null || value.length === 0) {
    errors.push(`${label} is malformed`);
    return null;
  }

  return value;
}

function assertEnum(
  value: string | null,
  allowed: Set<string>,
  label: string,
  errors: string[],
): string | null {
  if (value === null || !allowed.has(value)) {
    errors.push(`${label} is malformed`);
    return null;
  }

  return value;
}

function readRecord(
  record: Readonly<Record<string, unknown>> | undefined,
  key: string,
): Readonly<Record<string, unknown>> | undefined {
  const value = record?.[key];
  return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
