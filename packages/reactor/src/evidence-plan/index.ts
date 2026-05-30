// evidence-plan — RESHAPE (mostly delete): the evidence-by-reference seam.
//
// DISPOSITION (delta.md §A1 L76, §A3.7 L187–L190): the shallow/deep-roam *judge*
// plan — `executeShallowEvidencePlan`, `reconcileDeepRoam`, `DeepRoamTrigger`,
// `CompiledEvidencePlan` (policy-artifact spine), the kernel-safety fail-safe
// receipt — is judge-depth plumbing and is DELETED. What survives is the one
// idea delta keeps: "the *evidence-by-reference* seam survives conceptually"
// (delta.md §A3.7 L188). That idea is absorbed into the reconciler seam — this
// module is the small, pure, deterministic resolver the reconciler's
// "resolve evidence by reference from the waking receipt(s)" step delegates to
// (delta.md §A3.1 L140).
//
// THE PRINCIPLE (architecture.md §1 L44–L48, §8 L321–L323): "A render reads …
// the evidence the wake delivered, *by reference* (the waking receipt(s) carry
// fingerprints + a `semantic_diff`; the render reaches the upstream *published*
// world-model by reference)." Evidence is NEVER inlined into context by default.
// So resolution here is: turn a node's wake + its waking upstream receipt(s)
// into (a) the per-edge `WorldModelRef`s the render should read by reference,
// pinned to the exact published version each producer committed, and (b) the
// consumed `input_fingerprints` tuple — the memo key's second half — in resolved
// subscription order (SHAPES.md §3; architecture.md §6.1 "the consumed tuple,
// one per subscribed facet").
//
// There is NO judge, NO policy artifact, NO deep-roam, NO fail-safe receipt, NO
// `ReceiptV0`/`createKernelSafetyReceipt` import here (those modules embody the
// retired spine — SHAPES.md §9). This module imports ONLY the shared shapes.

import {
  ATOMIC_FACET,
  type ContentAddress,
  type Facet,
  type Fingerprint,
  type FingerprintMap,
  type InputFingerprints,
  type Receipt,
  type TopologyEdge,
  type Wake,
  type WorldModelRef,
} from "../shapes";

// ---------------------------------------------------------------------------
// The waking receipts a wake refers to, resolved by reference.
// ---------------------------------------------------------------------------

/**
 * A producer's receipt that woke the subscriber, addressed by its content
 * address. The wake's `refs` are content addresses (SHAPES.md §2); this pairs
 * each address with the receipt it points at so the resolver can read the
 * producer's published `fingerprints` and pin the exact version that moved.
 *
 * `self` / `external` wakes carry synthetic self/gateway receipts here too — the
 * resolver treats them uniformly (every wake is a receipt; world-model.md §5).
 */
export interface WakingReceipt {
  readonly ref: ContentAddress;
  readonly receipt: Receipt;
}

/**
 * One resolved upstream input the render should read BY REFERENCE: which facet
 * of which producer the subscriber consumes, the producer's published version to
 * pin (read-isolation; architecture.md §8 L328–L330), and the consumed
 * fingerprint token. A render reaches the artifact via the `world-model` store's
 * `readVersion(producer, version)` — it is told where the truth lives and reads
 * it as needed, never pre-stuffed into context (architecture.md §1 L44–L48).
 */
export interface ResolvedEvidence {
  readonly subscriber: string;
  readonly producer: string;
  readonly facet: Facet;
  readonly fingerprint: Fingerprint;
  /**
   * The published artifact reference to pin and read by reference. `version` is
   * the exact `ContentAddress` of the producer's published world-model — never
   * `null` for resolved input evidence (a wake means the producer committed a
   * published version).
   */
  readonly ref: WorldModelRef;
}

/**
 * The full evidence-by-reference resolution for one wake of one subscriber node.
 * This is the seam value the reconciler hands the render and uses to build the
 * memo key's second half.
 */
export interface EvidenceResolution {
  readonly subscriber: string;
  readonly wake: Wake;
  /** One resolved input per subscribed edge, in resolved subscription order. */
  readonly inputs: readonly ResolvedEvidence[];
  /**
   * The consumed facet tuple — the memo key's second half (SHAPES.md §3;
   * architecture.md §6.1). Order matches `inputs`, so the tuple is stable across
   * renders (topology-edge order is the resolved subscription order).
   */
  readonly input_fingerprints: InputFingerprints;
}

// ---------------------------------------------------------------------------
// Resolution.
// ---------------------------------------------------------------------------

/**
 * Resolve a subscriber's evidence BY REFERENCE from the topology edges and the
 * waking receipt(s).
 *
 * For each edge `subscriber.Requires.<facet> → producer.Maintains.<facet>`
 * (`edges` for this subscriber, in resolved subscription order — SHAPES.md §6),
 * find the producer's waking receipt, read the producer's published fingerprint
 * for that facet, and emit a `WorldModelRef` pinned to the producer's committed
 * `published` version. The location convention is the producer's published
 * artifact directory (`world-model.md §1`); the resolver does not invent a
 * filesystem layout — it carries `node`, `workspace:"published"`, and the
 * version to pin, and the world-model store maps that to a concrete location.
 *
 * Deterministic and total: it reads only its inputs, never an LLM, never a
 * judge. Throws only on a structurally-impossible wake (an edge whose producer
 * left no waking receipt, or a producer receipt missing the subscribed facet) —
 * a compiled-topology invariant violation the reconciler surfaces, not a
 * judgment call.
 */
export function resolveEvidenceByReference(
  subscriber: string,
  edges: readonly TopologyEdge[],
  wake: Wake,
  waking: readonly WakingReceipt[],
  options: ResolveOptions = {},
): EvidenceResolution {
  const byNode = new Map<string, WakingReceipt>();
  for (const w of waking) {
    // Last writer wins is undefined for a node; a node commits one published
    // version per wake. Reject ambiguity rather than silently pick.
    if (byNode.has(w.receipt.node)) {
      throw new Error(
        `ambiguous waking receipts for producer ${w.receipt.node}`,
      );
    }
    byNode.set(w.receipt.node, w);
  }

  const subscribedEdges = edges.filter((e) => e.subscriber === subscriber);

  const inputs: ResolvedEvidence[] = [];
  for (const edge of subscribedEdges) {
    const wkg = byNode.get(edge.producer);
    if (wkg === undefined) {
      throw new Error(
        `no waking receipt for producer ${edge.producer} ` +
          `subscribed by ${subscriber} on facet ${edge.facet}`,
      );
    }

    const fingerprint = readPublishedFacetFingerprint(
      wkg.receipt.fingerprints,
      edge.facet,
    );
    if (fingerprint === undefined) {
      throw new Error(
        `producer ${edge.producer} published no fingerprint for facet ` +
          `${edge.facet} required by ${subscriber}`,
      );
    }

    inputs.push({
      subscriber,
      producer: edge.producer,
      facet: edge.facet,
      fingerprint,
      ref: {
        node: edge.producer,
        workspace: "published",
        location: locatePublished(edge.producer, options),
        // Pin the exact version that woke us. The version-of-meaning is the
        // producer's atomic published fingerprint when it is a content address
        // (the v1 reference computation, SHAPES.md §1); otherwise null (the
        // store resolves the latest published, still read-isolated by the
        // reconciler's own pin).
        version: pinnedVersion(wkg),
      },
    });
  }

  return {
    subscriber,
    wake,
    inputs,
    input_fingerprints: inputs.map((i) => i.fingerprint),
  };
}

export interface ResolveOptions {
  /**
   * Optional mapping from producer node → published artifact location, supplied
   * by the world-model store. When absent, the resolver carries the node id as
   * the location and the store resolves the concrete directory (the location is
   * implementation-defined — SHAPES.md §5).
   */
  readonly locations?: Readonly<Record<string, string>>;
}

/**
 * Read a producer's published fingerprint for a required facet. A subscriber
 * that declares no facet consumes the producer's whole-truth atomic fingerprint
 * (`ATOMIC_FACET`) — the no-facet case is the singleton map (SHAPES.md §1;
 * architecture.md §6.1). Returns `undefined` if the producer never published the
 * requested facet.
 */
export function readPublishedFacetFingerprint(
  fingerprints: FingerprintMap,
  facet: Facet,
): Fingerprint | undefined {
  return fingerprints[facet];
}

/**
 * The atomic (whole-truth) published fingerprint of a producer — the version a
 * subscriber pins when it consumes the producer wholesale. Always present on a
 * published `FingerprintMap` (SHAPES.md §1: "always contains ATOMIC_FACET").
 */
export function atomicFingerprintOf(
  fingerprints: FingerprintMap,
): Fingerprint | undefined {
  return fingerprints[ATOMIC_FACET];
}

function pinnedVersion(wkg: WakingReceipt): ContentAddress | null {
  const atomic = atomicFingerprintOf(wkg.receipt.fingerprints);
  return isContentAddress(atomic) ? atomic : null;
}

function locatePublished(producer: string, options: ResolveOptions): string {
  return options.locations?.[producer] ?? producer;
}

function isContentAddress(value: string | undefined): value is ContentAddress {
  return value !== undefined && /^sha256:[a-f0-9]{64}$/.test(value);
}
