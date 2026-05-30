// The render atom — STANDALONE.
//
// The unit both layers agree on (architecture.md §1 L26–L31):
//   (contract, evidence, prior world-model) → (new world-model, receipt)
//
// This file is the SDK front door to the STANDALONE context of that atom: one
// session, NO harness. You give it evidence and the prior world-model; it
// computes a new world-model, applies the canonicalizer its contract compiled to
// (plain deterministic code, architecture.md §3.2), and signs a fingerprinted
// receipt — with no reconciler present. This is `plan.md`'s "language
// sovereignty" (architecture.md §1 L31; plan.md §2): a render is complete on its
// own and fingerprints itself.
//
// There is NO judge, NO policy, NO verdict here. A standalone render signals
// `rendered` (it committed a fingerprinted world-model) or `failed` (it committed
// nothing) — architecture.md §1 L51–L54. `skipped` is never a render's signal; it
// is the reconciler's pre-render decision (the mounted-DAG front door, §4.1).
//
// Source of truth: architecture.md §1 (the atom + the seam), §3.2 (canonicalizer
// applied locally), §6.1 (the receipt), §5.2 (world-model store); world-model.md
// §3 (fingerprint of meaning), §5 (wake sources); delta.md Part A (the front door
// exposes the render atom standalone + the mounted DAG); SHAPES.md §4/§5/§6.

import {
  type Cost,
  type Fingerprint,
  type InputFingerprints,
  type SemanticDiff,
  type Wake,
  type WakeSource,
  type WorldModelCommit,
  EMPTY_SEMANTIC_DIFF,
  createNullSignature,
} from "../shapes";
import { createReceipt, type LedgerReceipt } from "../receipt";
import {
  atomicCanonicalizer,
  COLD_START_FINGERPRINTS,
  type Canonicalizer,
  type WorldModelFiles,
  type WorldModelRead,
  type WorldModelStore,
  InMemoryWorldModelStore,
} from "../world-model";

// ---------------------------------------------------------------------------
// What a standalone render produces
// ---------------------------------------------------------------------------

/**
 * The body a render computes (architecture.md §1 L49–L50): the updated
 * world-model files (the candidate published artifact, having left its
 * `### Maintains` postconditions satisfied) plus the render-input
 * `semantic_diff` and the mechanical token `cost`. The atom commits these to the
 * store and fingerprints them — the render itself never computes the fingerprint
 * map (that is the canonicalizer's job, applied here, architecture.md §3.2).
 */
export interface RenderProduct {
  /** The candidate published world-model (the new truth). */
  readonly world_model: WorldModelFiles;
  /** Render-input context for the receipt — NEVER a wake signal (world-model.md §3). */
  readonly semantic_diff?: SemanticDiff;
  /** Mechanical token attribution observed during the render. */
  readonly cost: Cost;
}

/**
 * `failed` signal: the render committed nothing (an error or a failed
 * postcondition validator). The prior world-model stands; a `failed` receipt is
 * logged (architecture.md §4.1 L173–L175).
 */
export interface RenderFailure {
  readonly failed: true;
  readonly reason: string;
  readonly cost: Cost;
}

/**
 * The render function the caller supplies: read the evidence + the prior
 * world-model BY REFERENCE (architecture.md §1 seam L44–L48) and compute the new
 * truth. Returning a `RenderProduct` is the `rendered` signal; returning a
 * `RenderFailure` (or throwing) is the `failed` signal — nothing commits and the
 * prior truth stands (architecture.md §1 L51–L54).
 */
export type StandaloneRender = (
  context: RenderContext,
) => RenderProduct | RenderFailure;

/**
 * What the render reads (architecture.md §1 seam): the contract (by
 * fingerprint), the evidence by reference (carried on the `wake`), and the prior
 * world-model by reference. No truth is pre-stuffed into context — the render
 * queries the prior world-model `read` agentically (world-model.md §1 L24–L33).
 */
export interface RenderContext {
  readonly node: string;
  readonly contract_fingerprint: Fingerprint;
  readonly wake: Wake;
  /**
   * The consumed-facet tuple the harness resolved at render start — one slot per
   * subscribed facet, in resolved subscription order (architecture.md §6.1;
   * SHAPES.md §3). Empty `[]` for a standalone render (no subscriptions).
   */
  readonly input_fingerprints: InputFingerprints;
  /** The prior published world-model, by reference + its files. */
  readonly prior: WorldModelRead;
}

/** The inputs to a standalone render of the atom. */
export interface RenderAtomInput {
  /** The node's identity (the receipt's ledger is node-scoped). */
  readonly node: string;
  /** Which contract version is rendering (architecture.md §6.1). */
  readonly contract_fingerprint: Fingerprint;
  /**
   * The wake event. Standalone, the default is a `self`-sourced wake (no
   * upstream receipt drove it); a caller wiring external evidence may pass an
   * `external` or `input` wake with the waking receipt refs.
   */
  readonly wake?: Wake;
  /** The render: compute the new world-model from evidence + prior truth. */
  readonly render: StandaloneRender;
  /**
   * The compiled canonicalizer (architecture.md §3.2): plain deterministic code
   * that travels with the contract and decides what is material. Defaults to the
   * atomic whole-truth canonicalizer (the no-facet case) so the atom is usable
   * before a per-contract canonicalizer is compiled (S1).
   */
  readonly canonicalizer?: Canonicalizer;
  /**
   * The world-model store. Defaults to a fresh in-memory store — the standalone
   * atom is self-contained (architecture.md §5.3: tests inject fakes).
   */
  readonly store?: WorldModelStore;
}

/**
 * The result of a standalone render of the atom: the receipt (the single commit
 * object, architecture.md §6.1) and, when `rendered`, the world-model commit
 * (version + fingerprints).
 */
export interface RenderAtomResult {
  readonly node: string;
  readonly receipt: LedgerReceipt;
  /** Present iff the render committed a new world-model (`rendered`). */
  readonly commit?: WorldModelCommit;
}

const DEFAULT_WAKE: Wake = { source: "self", refs: [] };

/**
 * Run the render atom STANDALONE (architecture.md §1 L29–L31). Reads the prior
 * world-model by reference, runs the render, and — on `rendered` — commits the
 * new world-model to the store (write-and-fingerprint, applying the compiled
 * canonicalizer locally, §5.2/§3.2) and signs a fingerprinted receipt; on
 * `failed`, commits nothing and signs a `failed` receipt over the prior truth.
 *
 * No reconciler, no judge, no policy. The fingerprint comes from the
 * canonicalizer, never from a model "did this change" call (world-model.md §3).
 */
export function renderAtom(input: RenderAtomInput): RenderAtomResult {
  const store = input.store ?? new InMemoryWorldModelStore();
  const canonicalizer = input.canonicalizer ?? atomicCanonicalizer;
  const wake = input.wake ?? DEFAULT_WAKE;

  const prior = store.read(input.node);
  // The prior published fingerprints — the truth that stands on a `failed`
  // render (architecture.md §4.1 L173–L175). At cold start (no committed prior
  // version) there is no prior truth to canonicalize, so we use the reserved
  // cold-start atomic fingerprint (architecture.md §8 L335–L337); the compiled
  // canonicalizer is only applied to a real committed artifact, never to the
  // empty cold-start one (a per-contract canonicalizer may assume its schema).
  const priorFingerprints =
    prior.ref.version === null
      ? COLD_START_FINGERPRINTS
      : canonicalizer(prior.files);

  const product = runRender(input.render, {
    node: input.node,
    contract_fingerprint: input.contract_fingerprint,
    wake,
    input_fingerprints: [],
    prior,
  });

  if (isFailure(product)) {
    const receipt = createReceipt({
      node: input.node,
      contract_fingerprint: input.contract_fingerprint,
      wake,
      // Standalone has no resolved subscription tuple; the consumed-facet tuple
      // is empty (architecture.md §6.1: one slot per subscribed facet).
      input_fingerprints: [],
      fingerprints: priorFingerprints,
      semantic_diff: EMPTY_SEMANTIC_DIFF,
      prev: null,
      status: "failed",
      cost: product.cost,
      sig: createNullSignature(),
    });
    return { node: input.node, receipt };
  }

  // rendered: commit the new world-model — write-and-fingerprint on commit
  // (architecture.md §5.2 L208–L209). The canonicalizer derives the published
  // fingerprint map locally (architecture.md §3.2 L139–L143).
  const commit = store.commitPublished(
    input.node,
    product.world_model,
    canonicalizer,
  );

  const receipt = createReceipt({
    node: input.node,
    contract_fingerprint: input.contract_fingerprint,
    wake,
    input_fingerprints: [],
    fingerprints: commit.fingerprints,
    semantic_diff: product.semantic_diff ?? EMPTY_SEMANTIC_DIFF,
    prev: null,
    status: "rendered",
    cost: product.cost,
    sig: createNullSignature(),
  });

  return { node: input.node, receipt, commit };
}

// ---------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------

function runRender(
  render: StandaloneRender,
  context: RenderContext,
): RenderProduct | RenderFailure {
  try {
    return render(context);
  } catch (error) {
    // A thrown render is a `failed` signal — nothing commits (architecture.md
    // §1 L51–L54). The cost is unknown; attribute it to the wake source.
    return {
      failed: true,
      reason: error instanceof Error ? error.message : String(error),
      cost: zeroCost(context.wake.source),
    };
  }
}

function isFailure(value: RenderProduct | RenderFailure): value is RenderFailure {
  return (value as RenderFailure).failed === true;
}

/** Zero token attribution (no fresh/reused tokens) echoing the wake source. */
export function zeroCost(surprise_cause: WakeSource): Cost {
  return {
    provider: "none",
    model: "none",
    tokens: { fresh: 0, reused: 0 },
    surprise_cause,
  };
}
