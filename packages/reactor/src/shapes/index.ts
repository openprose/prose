// Shared shapes — the coordination spine for the Intelligent React / Reactor
// implementation. These are the canonical TypeScript shapes every downstream
// module (receipt, memo, world-model store, canonicalizer, postcondition,
// Forme, reconciler, projection, the SKILL compiler/IR) targets.
//
// Source of truth: architecture.md §6 (key data shapes), world-model.md §3–§5
// (fingerprinting, identity vocabulary, subscription semantics), delta.md §A6
// (receipt crosswalk). The `V0` naming is intentionally dropped (delta.md §C7:
// "dropping the `V0` type suffixes during the rewrite").
//
// Load-bearing invariants (see implementation/SHAPES.md):
//   - The memo key is EXACTLY (contract_fingerprint, input_fingerprints) —
//     nothing else (world-model.md §4).
//   - A fingerprint is a token that changes iff the semantically-material
//     content changes (world-model.md §3); the reference computation is sha256
//     over the canonical serialization of the material content.
//   - The world-model truth is the canonical artifact; SQL / vector indices /
//     dashboards are derived projections, never the truth (world-model.md §1).

// ---------------------------------------------------------------------------
// Identity vocabulary: fingerprints + content addresses
// ---------------------------------------------------------------------------

/**
 * A content address over a canonical serialization. The reference convention is
 * `sha256:<64 lowercase hex>` (world-model.md §3: "How it is computed is an
 * open, swappable convention — a content digest, a high-water timestamp …").
 */
export type ContentAddress = `sha256:${string}`;

/**
 * A fingerprint of meaning: a cheaply-computed token that changes if and only
 * if the semantically-relevant content changed (world-model.md §3, "the
 * invariant, not a menu"). The *invariant* is the definition; the *computation*
 * is a swappable detail. v1 computes it as a `ContentAddress` (sha256 over the
 * canonical serialization produced by the compiled canonicalizer), but the type
 * deliberately admits any string token to keep the convention open.
 */
export type Fingerprint = string;

/** A named, independently-subscribable part of a node's maintained truth. */
export type Facet = string;

/**
 * The reserved facet name for the whole-truth (atomic) fingerprint. A node that
 * declares no facets exposes a singleton `fingerprints` map keyed by this name
 * (architecture.md §6.1: "the atomic fingerprint is the reserved whole-truth
 * facet, so the no-facet case is the singleton map").
 */
export const ATOMIC_FACET = "@atomic" as const;
export type AtomicFacet = typeof ATOMIC_FACET;

/**
 * The published-truth fingerprint map: `{ facet → token }`. Always contains
 * `ATOMIC_FACET` (the whole-truth token); declared facets simply add keys.
 */
export type FingerprintMap = Readonly<Record<Facet, Fingerprint>>;

/**
 * The subscriber's facet resolver — the single read-half of a `FingerprintMap`
 * (world-model.md §5 L216–L221; SHAPES.md §1 L39). A declared facet uses its own
 * token; an undeclared facet (or the atomic-only case) resolves through the
 * reserved `ATOMIC_FACET` whole-truth token, which the map always carries. This
 * is the ONE resolution rule the selector boundary keys on — the store, the
 * pins, and the run-half resolver all consume it, so a move in facet *Y* leaves
 * an *X*-subscriber's resolved token untouched (architecture.md §3.2).
 */
export function resolveFacetFingerprint(
  fingerprints: FingerprintMap,
  facet: Facet,
): Fingerprint {
  const direct = fingerprints[facet];
  if (direct !== undefined) {
    return direct;
  }
  const atomic = fingerprints[ATOMIC_FACET];
  if (atomic === undefined) {
    throw new TypeError(
      `fingerprint map must contain the reserved ${ATOMIC_FACET} token`,
    );
  }
  return atomic;
}

// ---------------------------------------------------------------------------
// Wake: one event, three sources
// ---------------------------------------------------------------------------

/**
 * Who emitted the receipt that woke a node (world-model.md §5: "One event type,
 * three sources"):
 *   - `input`    — an upstream node's receipt (the default).
 *   - `self`     — the node's own continuity clock (a synthetic self-receipt).
 *   - `external` — a gateway turning a webhook / cron / manual trigger into an
 *                  edge receipt.
 */
export type WakeSource = "input" | "self" | "external";

/**
 * The wake event (architecture.md §6.1 `wake`): a `source` plus a reference to
 * the waking receipt(s) or tick. `refs` are content addresses of the upstream
 * receipt(s) for `input`, or of the synthetic self/external receipt otherwise.
 * Shipped as a structured field, never a bare enum (delta.md §A6: "ship `wake`
 * as a structured field, not a bare enum").
 */
export interface Wake {
  readonly source: WakeSource;
  readonly refs: readonly ContentAddress[];
}

// ---------------------------------------------------------------------------
// Memo key: EXACTLY (contract_fingerprint, input_fingerprints) — nothing else
// ---------------------------------------------------------------------------

/**
 * The tuple of upstream facet fingerprints a node consumed — one slot per
 * subscribed facet (architecture.md §6.1: "the consumed tuple (one per
 * subscribed facet)"). Order is the resolved subscription order from the
 * topology world-model so the tuple is stable across renders.
 */
export type InputFingerprints = readonly Fingerprint[];

/**
 * The memoization key. EXACTLY `(contract_fingerprint, input_fingerprints)` and
 * nothing else — no judge, no policy artifact, no evidence receipts beyond the
 * input fingerprints (world-model.md §4; delta.md Part F "Memo key richness").
 * If neither half moved since the node's last receipt, the reconciler writes a
 * `skipped` receipt and spawns nothing (architecture.md §4.1).
 */
export interface MemoKey {
  readonly contract_fingerprint: Fingerprint;
  readonly input_fingerprints: InputFingerprints;
}

// ---------------------------------------------------------------------------
// Cost (kept superset — observable "cost scales with surprise")
// ---------------------------------------------------------------------------

export interface Tokens {
  readonly fresh: number;
  readonly reused: number;
}

/**
 * Mechanical token attribution making "cost scales with surprise" observable
 * (architecture.md §6.1 `cost`; delta.md §A4: today's cost field is a superset
 * that additionally carries `surprise_cause`, which we keep). `surprise_cause`
 * echoes the wake source that drove the spend.
 */
export interface Cost {
  readonly provider: string;
  readonly model: string;
  readonly tokens: Tokens;
  readonly surprise_cause: WakeSource;
}

// ---------------------------------------------------------------------------
// Receipt signature: v1 meaning-layer attestation, signer explicitly null
// ---------------------------------------------------------------------------

/**
 * The null-signer state. v1 "signed" means chain-consistency at the meaning
 * layer, not a cryptographic byte-hash (world-model.md §5; delta.md Part F
 * "Crypto byte-hash today, deferred in spec"). The null signer is the only
 * honest v1 state; the `signer` adapter (and a non-null signature) returns with
 * the deferred crypto milestone (architecture.md §9).
 */
export interface NullSignature {
  readonly scheme: "none";
  readonly null_reason: string;
}

export const NULL_SIGNER_NOT_CONFIGURED_REASON =
  "no-signer-adapter-configured" as const;

export function createNullSignature(): NullSignature {
  return { scheme: "none", null_reason: NULL_SIGNER_NOT_CONFIGURED_REASON };
}

export type ReceiptSignature = NullSignature;

// ---------------------------------------------------------------------------
// Receipt: the single commit object and the unit of the ledger
// ---------------------------------------------------------------------------

/**
 * Render outcomes — NOT judge verdicts (delta.md §A6: replace
 * `up/drifting/down/blocked` with render outcomes). Only `rendered` with a
 * moved fingerprint propagates (world-model.md §8).
 */
export type ReceiptStatus = "rendered" | "skipped" | "failed";

/**
 * The ideal receipt (architecture.md §6.1). The wake event, the memo-key
 * record, the audit entry, and the trust artifact in one. Content-addressed
 * over its fingerprints-of-meaning and verified before append (§5.1).
 */
export interface Receipt {
  /** The node's identity; the ledger is node-scoped. */
  readonly node: string;
  /** Which contract version produced this receipt. */
  readonly contract_fingerprint: Fingerprint;
  /** The wake's source + reference to the waking receipt(s) or tick. */
  readonly wake: Wake;
  /** The consumed tuple (one per subscribed facet) — the memo key's second half. */
  readonly input_fingerprints: InputFingerprints;
  /** The published-truth `{ facet → token }` map (always includes ATOMIC_FACET). */
  readonly fingerprints: FingerprintMap;
  /** Render-input context ("3 controls went stale") — NEVER a wake signal. */
  readonly semantic_diff: SemanticDiff;
  /** Pointer to the prior receipt; chains the ledger. `null` at cold start. */
  readonly prev: ContentAddress | null;
  /** Render outcome: rendered | skipped | failed. */
  readonly status: ReceiptStatus;
  /** Mechanical token attribution (observable surprise-cost). */
  readonly cost: Cost;
  /** v1 meaning-layer attestation; the signer is the explicit null state. */
  readonly sig: ReceiptSignature;
}

/**
 * A semantic diff — render-input context carried in the receipt, never a wake
 * *signal* (world-model.md §3: "valuable — but as render input … It is never a
 * wake signal"). Free-form per node; a `skipped` receipt carries the empty diff.
 */
export type SemanticDiff = Readonly<Record<string, unknown>>;

export const EMPTY_SEMANTIC_DIFF: SemanticDiff = Object.freeze({});

// ---------------------------------------------------------------------------
// World-model: the maintained truth a node keeps current
// ---------------------------------------------------------------------------

/**
 * The visibility split (world-model.md §1; architecture.md §5.2). The
 * `published` artifact is the canonical, fingerprinted truth downstreams
 * subscribe to. The `workspace` is the render's private scratch — never
 * fingerprinted, never subscribed to; it reaches `published` only through an
 * explicit commit (delta.md Part F "State shape").
 */
export type WorldModelWorkspaceKind = "published" | "workspace";

/**
 * A reference to where a world-model artifact lives. The render reads the prior
 * truth *by reference* (architecture.md §1 seam; world-model.md §1: "told where
 * the truth lives and reads it as needed"), not pre-stuffed into context. The
 * canonical artifact is a directory by default (single file is the degenerate
 * case).
 */
export interface WorldModelRef {
  readonly node: string;
  readonly workspace: WorldModelWorkspaceKind;
  /** Implementation-defined location (a directory path, an object key, …). */
  readonly location: string;
  /**
   * The content address of the published artifact's canonical serialization, or
   * `null` for the private workspace (which is never fingerprinted) and for a
   * cold-start published artifact with no committed version yet.
   */
  readonly version: ContentAddress | null;
}

/**
 * The result of committing a render's published world-model. The store produces
 * a deterministic canonical serialization (architecture.md §5.2 / §10: stable
 * file ordering, path/encoding normalization) over which the compiled
 * canonicalizer computes the `fingerprints` (world-model.md §3). The `version`
 * is the content address of that canonical serialization.
 */
export interface WorldModelCommit {
  readonly node: string;
  readonly version: ContentAddress;
  readonly fingerprints: FingerprintMap;
}

// ---------------------------------------------------------------------------
// Compile-phase IR: the seam the SKILL compiler and the SDK compile renders
// both target (architecture.md §2, §3; delta.md §A5)
// ---------------------------------------------------------------------------

/**
 * The topology world-model — Forme's output (architecture.md §6.3). A
 * maintained truth like any other: nodes, the resolved subscription edges, the
 * external-driven entry points, and the acyclicity postcondition result. The
 * reconciler reads `edges` to resolve propagation targets (§4.1).
 */
export interface TopologyWorldModel {
  /** Declared contracts mounted as nodes. */
  readonly nodes: readonly TopologyNode[];
  /** Resolved subscriptions: subscriber.Requires.<facet> → producer.Maintains.<facet>. */
  readonly edges: readonly TopologyEdge[];
  /** External-driven triggers (gateways) — the system's ingress points. */
  readonly entry_points: readonly string[];
  /** Acyclicity postcondition result (Forme's own `### Maintains`, §3.1). */
  readonly acyclic: boolean;
}

export interface TopologyNode {
  readonly node: string;
  readonly contract_fingerprint: Fingerprint;
  readonly wake_source: WakeSource;
}

export interface TopologyEdge {
  readonly subscriber: string;
  readonly producer: string;
  /** The producer facet the subscriber depends on (ATOMIC_FACET if none declared). */
  readonly facet: Facet;
}

/**
 * A reference to a per-node compiled canonicalizer (architecture.md §3.2). The
 * canonicalizer is plain deterministic code that travels with the compiled
 * contract: `canonicalizer(world-model) → FingerprintMap`. A standalone render
 * applies it locally to fingerprint its own receipt (architecture.md §1, §7.3),
 * so the reference resolves to a deterministic artifact, not a model call.
 */
export interface CanonicalizerRef {
  readonly node: string;
  /** Locator for the compiled canonicalizer artifact (path / module id). */
  readonly artifact: string;
  /** The facet boundaries the canonicalizer emits (always includes ATOMIC_FACET). */
  readonly facets: readonly Facet[];
}

/**
 * A reference to a per-node compiled postcondition validator (architecture.md
 * §3.3). The folded-in `### Criteria` compile to validators: deterministic
 * verify-on-commit where expressible, render-attested where irreducibly
 * semantic. The deterministic engine is `cycle/evaluatePredicate`.
 */
export interface PostconditionValidatorRef {
  readonly node: string;
  /** Locator for the compiled validator artifact (path / module id). */
  readonly artifact: string;
  /**
   * `deterministic` ⇒ harness verifies on commit; `render-attested` ⇒ the
   * render self-polices before signing (architecture.md §3.3).
   */
  readonly mode: "deterministic" | "render-attested";
}

/**
 * The compile-phase IR (architecture.md §2 / §3; delta.md §A5 "the ideal IR
 * carries the topology world-model + per-node canonicalizers + validators").
 * Produced by the compile phase on contract-set change; consumed by the run
 * phase (the dumb reconciler) and authored to by the SKILL `compiler/ir` doc.
 * Replaces the judge-era manifest (activations / criteria / formeManifests).
 */
export interface CompilePhaseIR {
  readonly topology: TopologyWorldModel;
  readonly canonicalizers: readonly CanonicalizerRef[];
  readonly postconditions: readonly PostconditionValidatorRef[];
  /** The per-node contract fingerprints frozen at compile time. */
  readonly contract_fingerprints: Readonly<Record<string, Fingerprint>>;
}

// ---------------------------------------------------------------------------
// Memo-key construction (the one derived value with a fixed shape)
// ---------------------------------------------------------------------------

/**
 * Build the memo key from EXACTLY the contract fingerprint and the input
 * fingerprint tuple. No other input is admissible (world-model.md §4).
 */
export function makeMemoKey(
  contract_fingerprint: Fingerprint,
  input_fingerprints: InputFingerprints,
): MemoKey {
  return {
    contract_fingerprint,
    input_fingerprints: Object.freeze([...input_fingerprints]),
  };
}
