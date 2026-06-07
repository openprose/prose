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

// ---------------------------------------------------------------------------
// Branded identity (decision #2): Fingerprint / NodeId / Facet
// ---------------------------------------------------------------------------
//
// These three identity strings carry a nominal brand so the type checker keeps
// them apart from arbitrary text. Branding closes two real footguns at compile
// time — a stray `"*"` facet that would never propagate, and a `Fingerprint`
// crossed with a node id — and makes every SDK-returned identity self-describing.
//
// The boundary rule (decision #2): the SDK *returns* branded values everywhere
// (so they stay tracked through the engine), but public *input* positions accept
// plain `string` via {@link NodeIdInput} / {@link FacetInput}, so author literals
// like `reactor.ingest("scout-desire")` still compile with zero ceremony.
// `Fingerprint` is branded HARD — consumers never author one, so there is no
// string-accepting input form; the SDK is the only producer (via the compiled
// canonicalizer) and brands it with {@link asFingerprint}.

declare const FINGERPRINT_BRAND: unique symbol;
declare const NODE_ID_BRAND: unique symbol;
declare const FACET_BRAND: unique symbol;

/**
 * A fingerprint of meaning: a cheaply-computed token that changes if and only
 * if the semantically-relevant content changed (world-model.md §3, "the
 * invariant, not a menu"). The *invariant* is the definition; the *computation*
 * is a swappable detail. v1 computes it as a `ContentAddress` (sha256 over the
 * canonical serialization produced by the compiled canonicalizer), but the type
 * deliberately admits any string token to keep the convention open.
 *
 * Branded HARD: consumers never author a fingerprint — the SDK is the only
 * producer (the compiled canonicalizer, via {@link asFingerprint}). The brand
 * makes a hand-rolled fingerprint a compile error.
 */
export type Fingerprint = string & { readonly [FINGERPRINT_BRAND]: "Fingerprint" };

/**
 * A node's identity — the ledger is node-scoped and the topology keys on it.
 * Branded so SDK-returned ids stay tracked; author literals reach input
 * positions through {@link NodeIdInput} (which also accepts plain `string`).
 */
export type NodeId = string & { readonly [NODE_ID_BRAND]: "NodeId" };

/**
 * A named, independently-subscribable part of a node's maintained truth.
 * Branded so a stray non-facet string (e.g. `"*"`) is a compile error; author
 * literals reach input positions through {@link FacetInput}.
 */
export type Facet = string & { readonly [FACET_BRAND]: "Facet" };

/**
 * The string-friendly INPUT type for a node id. Public input positions accept
 * either a tracked {@link NodeId} or a plain string literal, so authoring stays
 * ceremony-free (`reactor.ingest("scout-desire")`). The SDK brands on the way in.
 */
export type NodeIdInput = NodeId | string;

/**
 * The string-friendly INPUT type for a facet. Public input positions accept
 * either a tracked {@link Facet} or a plain string literal. The SDK brands on
 * the way in.
 */
export type FacetInput = Facet | string;

/**
 * Brand a raw string as a {@link Fingerprint}. The SOLE producer boundary — the
 * compiled canonicalizer digest and the receipt/topology builders call this to
 * mint the tracked token. A no-op at runtime (identity); the value is already
 * the canonical string.
 */
export function asFingerprint(value: string): Fingerprint {
  return value as Fingerprint;
}

/**
 * Brand a raw string (or pass through an already-branded id) as a {@link NodeId}.
 * Called at the SDK's input boundary so author literals enter the engine tracked.
 */
export function asNodeId(value: NodeIdInput): NodeId {
  return value as NodeId;
}

/**
 * Brand a raw string (or pass through an already-branded facet) as a
 * {@link Facet}. Called at the SDK's input boundary so author literals enter the
 * engine tracked.
 */
export function asFacet(value: FacetInput): Facet {
  return value as Facet;
}

/**
 * The string-friendly INPUT projection of a branded shape (decision #2). Maps the
 * branded identity leaves ({@link Fingerprint}/{@link NodeId}/{@link Facet}) back
 * to plain `string` recursively, so a SDK *input* position can be authored from
 * literals (`{ node: "scout", fingerprints: { "@atomic": "fp-1" } }`) while the
 * SDK *returns* the hard-branded shape. The builder brands on the way in. A plain
 * `string` matches none of the brands and is left untouched; `ContentAddress`
 * (its own template-literal type) is likewise preserved.
 */
export type Unbrand<T> = T extends Fingerprint
  ? string
  : T extends NodeId
    ? string
    : T extends Facet
      ? string
      : T extends ContentAddress
        ? T
        : T extends readonly (infer E)[]
          ? readonly Unbrand<E>[]
          : T extends object
            ? { readonly [K in keyof T]: Unbrand<T[K]> }
            : T;

/**
 * The reserved facet name for the whole-truth (atomic) fingerprint. A node that
 * declares no facets exposes a singleton `fingerprints` map keyed by this name
 * (architecture.md §6.1: "the atomic fingerprint is the reserved whole-truth
 * facet, so the no-facet case is the singleton map").
 */
export const ATOMIC_FACET = "@atomic" as "@atomic" & Facet;
export type AtomicFacet = typeof ATOMIC_FACET;

/**
 * The published-truth fingerprint map: `{ facet → token }`. Always contains
 * `ATOMIC_FACET` (the whole-truth token); declared facets simply add keys.
 */
export type FingerprintMap = Readonly<Record<string, Fingerprint>>;

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
  facet: FacetInput,
): Fingerprint {
  const direct = fingerprints[facet as Facet];
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

/**
 * RESERVED FORWARD SEAM (type-only; nothing built ahead). The signer injection
 * port the crypto-byte-hash milestone (architecture.md §9; delta.md Part F
 * "Crypto byte-hash today, deferred in spec") will fill. Declaring it now means
 * the milestone is a pure backend swap rather than a breaking API change:
 *   - {@link ReceiptSignature} widens ADDITIVELY (a non-null branch joins the
 *     {@link NullSignature} union) when a real signer lands; and
 *   - a `SignerPort` is supplied alongside the other reactor ports, exactly as
 *     the storage/ledger/world-model ports are today.
 *
 * The ONLY honest v1 state is the null signer ({@link createNullSignature}); the
 * default reactor supplies no `SignerPort`, so v1 receipts carry
 * {@link NullSignature}. This interface is declared, NOT consumed — no reactor
 * path reads it in `0.3.0`. Reachable from `@openprose/reactor/internals`.
 */
export interface SignerPort {
  /**
   * Attest a receipt's canonical content hash, producing the receipt's
   * {@link ReceiptSignature}. The milestone widens the return type additively;
   * the v1 contract is "no signer ⇒ {@link createNullSignature}".
   */
  readonly sign: (contentHash: string) => ReceiptSignature;
}

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
  readonly node: NodeId;
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
  readonly node: NodeId;
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
  readonly node: NodeId;
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
  readonly entry_points: readonly NodeId[];
  /** Acyclicity postcondition result (Forme's own `### Maintains`, §3.1). */
  readonly acyclic: boolean;
}

export interface TopologyNode {
  readonly node: NodeId;
  readonly contract_fingerprint: Fingerprint;
  readonly wake_source: WakeSource;
}

export interface TopologyEdge {
  readonly subscriber: NodeId;
  readonly producer: NodeId;
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
  readonly node: NodeId;
  /** Locator for the compiled canonicalizer artifact (path / module id). */
  readonly artifact: string;
  /** The facet boundaries the canonicalizer emits (always includes ATOMIC_FACET). */
  readonly facets: readonly Facet[];
}

/**
 * A reference to a per-node compiled postcondition validator (architecture.md
 * §3.3). The `### Maintains` postconditions compile to validators: deterministic
 * verify-on-commit where expressible, render-attested where irreducibly
 * semantic. The deterministic engine is `cycle/evaluatePredicate`.
 */
export interface PostconditionValidatorRef {
  readonly node: NodeId;
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
  contract_fingerprint: string,
  input_fingerprints: readonly string[],
): MemoKey {
  return {
    contract_fingerprint: asFingerprint(contract_fingerprint),
    input_fingerprints: Object.freeze(input_fingerprints.map(asFingerprint)),
  };
}
