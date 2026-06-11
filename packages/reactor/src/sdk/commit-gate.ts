// The commit gate on the LIVE run path — EXPERIMENT C (spec 02 gap cluster 1).
//
// `compilePostconditions(...)` runs on the compile path and emits each node's
// validator set into the IR, but until this module the run phase committed on
// the render's own done/failed self-attestation alone — `gateCommit(...)` had no
// non-test caller. `withCommitGate(render, deps)` closes that gap as a render
// WRAPPER: a `RenderProduct` returned to mountDag's `spawnRenderAsync` IS the
// commit trigger, so intercepting the product INSIDE the render body and
// downgrading it to a `RenderFailure` on gate failure reuses the entire existing
// failed path (failed receipt, prior fingerprints copied, no propagation,
// downstream never wakes) without touching mounted-dag, the reconciler, or the
// receipt machinery.
//
// The Workflow-style bounded validate-and-retry: on gate failure with retries
// remaining, the inner render is re-invoked with the DETERMINISTIC validation
// failures threaded onto the context (`RenderContext.commit_gate_retry`), so the
// model sees exactly which postconditions tripped. Retries exhausted ⇒ a
// `RenderFailure` whose cost honestly sums every attempt — nothing commits, the
// fingerprint stays unmoved, the prior truth stands (fail closed).
//
// Constitutional invariants this module preserves:
//   - The gate itself is DETERMINISTIC and offline (`gateCommit` over
//     `evaluatePredicate` — no model, no clock). Only a RETRY re-render spends
//     model work.
//   - Zero-token memo-skips are structurally unaffected: the reconciler skips
//     PRE-spawn, so a skipped node never reaches this wrapper at all.
//   - No model call lands on the reconcile/commit decision path — the gate's
//     verdict is pure predicate evaluation over caller-projected facts.
//
// Offline-build guard: imports only `../postcondition` (pure), `../cycle` types,
// `../world-model` types, and the sdk mount/atom types — no `@openai/agents`,
// no `zod`. Safe behind the `/run/types` offline boundary.

import type { PredicateFacts } from "../cycle/index";
import {
  gateCommit,
  type CommitGateResult,
  type CompiledPostconditionSet,
  type PostconditionFailure,
} from "../postcondition";
import { ATOMIC_FACET, type Cost } from "../shapes";
import type { WorldModelFiles } from "../world-model";
import type { AsyncMountedRender } from "./mounted-dag";
import type {
  RenderContext,
  RenderFailure,
  RenderProduct,
} from "./render-atom";

// ---------------------------------------------------------------------------
// The caller-projected facts (the gate's deterministic input)
// ---------------------------------------------------------------------------

/**
 * Deterministic projection: the render's CANDIDATE output files → the facts the
 * node's compiled deterministic validators read. Travels with the caller,
 * exactly like {@link TruthProjection} — the harness never invents a fact
 * convention (the postcondition compile session invents the fact NAMES, and no
 * compiled artifact maps candidate files → facts today, so the projection is the
 * caller's responsibility). A fact the projection omits evaluates
 * `indeterminate` and FAILS CLOSED — supply every fact the node's predicates
 * name.
 */
export type FactsProjection = (files: WorldModelFiles) => PredicateFacts;

/**
 * The opt-in commit-gate knobs for `runProject` (EXPERIMENT C). Absent — or
 * `enforcePostconditions !== true` — ⇒ `runProject` behavior is byte-identical
 * to today (the render is never wrapped, the gate never evaluates).
 */
export interface RunCommitGateOptions {
  /** Evaluate each node's compiled validators BEFORE commit. Default off. */
  readonly enforcePostconditions: boolean;
  /**
   * The bounded validate-and-retry budget: how many RE-renders a gate failure
   * may spend before failing closed. Default `0` = gate only, no retry spend.
   * NOTE: a retried render's receipt `cost.tokens` honestly sums EVERY attempt
   * (up to `1 + maxCommitRetries` sessions on one receipt).
   */
  readonly maxCommitRetries?: number;
  /**
   * Per-node facts projection over the render's CANDIDATE output. REQUIRED
   * (boot guard) when any node's compiled set carries ≥1 deterministic
   * validator — a missing fact is `indeterminate` and fails closed forever.
   */
  readonly factsFor?: (node: string) => FactsProjection;
}

/** The wrapper's resolved dependencies (runProject builds these). */
export interface CommitGateDeps {
  /** The node's compiled validator set (undefined / empty ⇒ no gate). */
  readonly setFor: (node: string) => CompiledPostconditionSet | undefined;
  /** The per-node candidate-facts projection. */
  readonly factsFor: (node: string) => FactsProjection;
  /** Bounded retry budget (non-negative integer; 0 = gate only). */
  readonly maxCommitRetries: number;
}

// ---------------------------------------------------------------------------
// The wrapper
// ---------------------------------------------------------------------------

/**
 * Wrap an {@link AsyncMountedRender} with the deterministic commit gate + the
 * bounded retry. The gate runs BEFORE the product reaches mountDag's
 * `spawnRenderAsync` (i.e. before `store.commitPublished`):
 *
 *   1. Run the inner render with the UNCHANGED context (attempt 1 is
 *      byte-identical to today).
 *   2. A `RenderFailure` from the inner render returns as-is (existing failure
 *      semantics — no gate, no retry; cost sums any prior attempts).
 *   3. A `RenderProduct` with no validator set (or an empty one) returns
 *      unchanged — no postconditions ⇒ today's behavior exactly.
 *   4. Otherwise evaluate `gateCommit(set, factsFor(node)(candidate files),
 *      product.attestation ?? {})` — pure, deterministic, offline.
 *   5. Gate passes ⇒ return the product (cost = honest sum over all attempts).
 *   6. Gate fails with retries left ⇒ re-invoke the inner render with
 *      `commit_gate_retry` threaded onto the context (the deterministic failure
 *      list the model must fix).
 *   7. Retries exhausted ⇒ a `RenderFailure` with the joined failure reasons and
 *      the summed cost — nothing commits, the prior truth stands.
 */
export function withCommitGate(
  render: AsyncMountedRender,
  deps: CommitGateDeps,
): AsyncMountedRender {
  return async (ctx: RenderContext): Promise<RenderProduct | RenderFailure> => {
    const set = deps.setFor(ctx.node);
    // No compiled validator set (or an EMPTY one): the gate has nothing to
    // evaluate — one attempt, byte-identical to the unwrapped render.
    if (
      set === undefined ||
      (set.deterministic.length === 0 && set.attested.length === 0)
    ) {
      return render(ctx);
    }

    const maxAttempts = 1 + deps.maxCommitRetries;
    let cost: Cost | undefined;
    let lastFailures: readonly PostconditionFailure[] = [];
    let attemptCtx: RenderContext = ctx;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const product = await render(attemptCtx);
      cost = cost === undefined ? product.cost : sumCosts(cost, product.cost);

      if (isFailure(product)) {
        // The inner render failed on its own: existing failure semantics — the
        // gate never evaluated, no retry is spent. The cost still honestly sums
        // any earlier gate-refused attempts.
        return { ...product, cost };
      }

      // THE GATE — pure predicate evaluation over the CANDIDATE output's
      // caller-projected facts + the render's self-attestation. Deterministic,
      // offline, judge-free. A missing attestation fails closed (gateCommit's
      // existing semantics: `{}` attests nothing). A THROWING projection (e.g.
      // the candidate file the caller parses is malformed) is an indeterminate
      // gate failure — fail closed, retry-eligible (the retry may write a
      // parseable candidate), cost kept honest.
      const gate = evaluateGate(set, deps, ctx.node, product);

      if (gate.status === "rendered") {
        return { ...product, cost };
      }

      lastFailures = gate.failures;
      if (attempt < maxAttempts) {
        // Feed the DETERMINISTIC validation errors into the retry render's
        // context. The spread owns the only write site of `commit_gate_retry`.
        attemptCtx = {
          ...ctx,
          commit_gate_retry: {
            attempt: attempt + 1,
            max_attempts: maxAttempts,
            failures: gate.failures,
          },
        };
      }
    }

    // Retries exhausted: fail closed. Nothing commits, the fingerprint stays
    // unmoved, the prior truth stands — the reconciler writes the failed
    // receipt (copying prior fingerprints) and propagates nothing.
    return {
      failed: true,
      reason: formatGateRefusal(ctx.node, maxAttempts, lastFailures),
      // `cost` is always assigned: maxAttempts >= 1, so the loop ran.
      cost: cost as Cost,
    };
  };
}

// ---------------------------------------------------------------------------
// Boot-guard helper (runProject refuses a coarsened / ill-formed set loudly)
// ---------------------------------------------------------------------------

/**
 * Structural check that a value is a well-formed {@link CompiledPostconditionSet}
 * (a non-empty `node` string + `deterministic`/`attested` arrays). The CLI's
 * IR-cache shape coarsens postconditions to the persisted REF only — under
 * enforcement that must be a LOUD boot refusal, never silent non-enforcement.
 */
export function isCompiledPostconditionSet(
  value: unknown,
): value is CompiledPostconditionSet {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record["node"] === "string" &&
    record["node"].length > 0 &&
    Array.isArray(record["deterministic"]) &&
    Array.isArray(record["attested"])
  );
}

// ---------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------

/**
 * Run the deterministic gate over one candidate product. A caller projection
 * that THROWS (malformed candidate bytes, a bad parse) cannot vouch for the
 * commit: it degrades to a synthetic `indeterminate` failure — the same
 * conservative refusal `gateCommit` applies to an unevaluable predicate — so
 * the wrapper fails closed WITHOUT losing the attempt's accumulated cost, and
 * a retry may still produce a projectable candidate.
 */
function evaluateGate(
  set: CompiledPostconditionSet,
  deps: CommitGateDeps,
  node: string,
  product: RenderProduct,
): CommitGateResult {
  let facts: PredicateFacts;
  try {
    facts = deps.factsFor(node)(product.world_model);
  } catch (error) {
    return {
      status: "failed",
      failures: [
        {
          id: "facts-projection",
          facet: ATOMIC_FACET,
          kind: "indeterminate",
          reason:
            `facts projection threw over the candidate output: ` +
            (error instanceof Error ? error.message : String(error)),
        },
      ],
    };
  }
  return gateCommit(set, facts, product.attestation ?? {});
}

/**
 * Sum two attempts' costs: tokens add; the provider/model labels come from the
 * last attempt reporting a REAL provider (a thrown attempt reports `none`);
 * `surprise_cause` stays the wake that drove the whole render.
 */
function sumCosts(a: Cost, b: Cost): Cost {
  return {
    provider: b.provider !== "none" ? b.provider : a.provider,
    model: b.model !== "none" ? b.model : a.model,
    tokens: {
      fresh: a.tokens.fresh + b.tokens.fresh,
      reused: a.tokens.reused + b.tokens.reused,
    },
    surprise_cause: a.surprise_cause,
  };
}

/** The legible fail-closed reason (the v0 receipt has no reason field; this rides the RenderFailure/log path). */
function formatGateRefusal(
  node: string,
  attempts: number,
  failures: readonly PostconditionFailure[],
): string {
  const detail = failures
    .map((f) => `[${f.id}] (${f.kind}) ${f.reason}`)
    .join("; ");
  return (
    `commit gate refused node "${node}" after ${attempts} attempt(s): ` +
    (detail.length > 0 ? detail : "postcondition validation failed")
  );
}

function isFailure(
  value: RenderProduct | RenderFailure,
): value is RenderFailure {
  return (value as RenderFailure).failed === true;
}
