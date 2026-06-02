// continuity-scheduler.ts — the clock-driven self-driven cadence loop
// (gap-audit 00-INVENTORY #11; build plan Phase 4a).
//
// The `forecast/` module (evaluateContinuityTick + createSelfRecheckReceipt)
// holds the self-driven `### Continuity` math — "which facets have lapsed as of
// `as_of`, what is the soonest remaining `valid_until`, and the SYNTHETIC
// self-receipt that records the lapse". This module is the DRIVER that turns
// that math into an end-to-end loop: it arms a timer off `next_self_recheck`,
// manufactures the tick, and (on a lapse) appends the synthetic self-receipt and
// drains propagation — the forecast path `dag.tick` deliberately bypasses. The
// CLI `serve` command now wires it live: `createAsyncContinuityScheduler` is
// armed once at boot and polled on a flat `--poll-interval` cadence, so U09
// (self-driven recheck on a `valid_until` lapse) is driveable end-to-end.
//
// THE MECHANISM (world-model.md §5/§6; forecast/index.ts header). A self-driven
// node's continuity clock emits a SYNTHETIC SELF-RECEIPT — a tick whose
// `wake.source === "self"`. The tick is NOT a model render: a lapsed `valid_until`
// is a DETERMINISTIC, replayable move (`applyFreshnessMove`), so the forecast math
// produces a complete receipt with the lapsed facet's fingerprint MOVED, costing
// zero tokens (`surprise_cause: "self"`). "Time becoming material" is just another
// change that propagates as surprise — there is no special clock path in the
// reconciler. So the scheduler:
//   1. arms each self-driven node's soonest `next_self_recheck` off its freshness;
//   2. when the clock reaches it, evaluates the tick; on a lapse it APPENDS the
//      synthetic self-receipt to the ledger (the tick IS the receipt — "every wake
//      is a receipt") and PROPAGATES the moved facet to downstream subscribers
//      (a normal reconciler drain of the propagation targets); then RE-ARMS.
//
// Why the synthetic receipt and not `dag.tick` (a self WAKE through the
// reconciler)? Because the memo key is `(contract_fingerprint, input_fingerprints)`
// — a self wake on a SOURCE node with unchanged inputs MEMO-SKIPS (architecture.md
// §6.1; the run-phase carry-over). The honest way a freshness lapse re-renders is
// the freshness BRIDGE: the lapse moves the facet fingerprint directly, which the
// synthetic receipt records, which then moves downstream input-fingerprints and
// wakes those subscribers through the ordinary memo path. The determinism boundary
// holds: fingerprinting the lapse is a non-model op (world-model.md §6).
//
// Source of truth:
//   - architecture.md §4.2 (L181–L191): the self-driven continuity beat.
//   - world-model.md §5 (L234–L236): every wake is a receipt; self-driven = the
//     node's continuity clock emitting a synthetic self-receipt.
//   - world-model.md §6 (L267–L283): freshness STATE (`valid_until`) is data;
//     freshness POLICY (the recheck cadence) reads the soonest `valid_until`.
//   - forecast/index.ts: `evaluateContinuityTick` (the sleep/fire + `next_self_recheck`
//     math + the synthetic-receipt manufacture this loop finally calls).

import {
  evaluateContinuityTick,
  type ContinuitySchedule,
  type ContinuityTickResult,
} from "../forecast";
import {
  movedFacetsBetween,
  propagationTargets,
  type ReconcileResult,
  type ReconcilerTopology,
} from "../reactor";
import type { Facet, FingerprintMap } from "../shapes";
import type { LedgerReceipt } from "../receipt";
import type { MountedDag } from "./mounted-dag";

// ---------------------------------------------------------------------------
// The freshness reader — the seam onto the world-model's freshness STATE
// ---------------------------------------------------------------------------

/**
 * Read a self-driven node's current freshness state as a {@link ContinuitySchedule}.
 *
 * Freshness *state* (`valid_until` per facet) is DATA carried in the node's
 * published world-model (world-model.md §6); how a given render encodes it there
 * is a render/contract concern, NOT a fixed substrate schema. So the scheduler
 * takes the freshness state by INJECTION — a pure function the caller supplies
 * that projects the node's current truth + last receipt (`prev`,
 * `input_fingerprints`, per-facet fingerprints) into the forecast schedule.
 * Returns `null` for a node with no freshness policy (a timeless node never arms a
 * recheck) or one that has not rendered yet.
 *
 * This keeps the scheduler decoupled from any particular world-model encoding
 * (the build-the-destination-directly rule): a fake-render test supplies a tiny
 * projector over its JSON truth + ledger; a live deployment supplies the projector
 * the canonicalizer-compile session would emit alongside the facet field-paths.
 */
export type NodeFreshnessReader = (node: string) => ContinuitySchedule | null;

// ---------------------------------------------------------------------------
// Scheduler configuration + state
// ---------------------------------------------------------------------------

export interface ContinuitySchedulerInput {
  /** The mounted run-phase DAG the scheduler appends ticks to and propagates over. */
  readonly dag: MountedDag;
  /**
   * The compiled topology (the SAME one the DAG was mounted over). The scheduler
   * reads its edges to resolve the downstream subscribers a moved facet wakes
   * (the reconciler handle does not re-expose the topology, so the caller threads
   * it here — it already holds it from `mountDag`/`createReactor`).
   */
  readonly topology: ReconcilerTopology;
  /**
   * The set of self-driven node identities the scheduler arms. Only nodes whose
   * `### Continuity` admits a `self` source belong here; an input-only node is
   * never armed (its cadence is upstream receipts, not a clock).
   */
  readonly nodes: readonly string[];
  /** Project a node's current freshness STATE + last receipt into a forecast schedule. */
  readonly readFreshness: NodeFreshnessReader;
}

/**
 * A node's armed cadence: the soonest instant its continuity clock should next
 * examine the world for a lapsed `valid_until`. `null` means "nothing armed" — a
 * timeless node, or a node whose every facet has already lapsed-and-moved with no
 * remaining future expiry (it re-arms only when its next render sets a fresh
 * `valid_until`).
 */
export interface ArmedRecheck {
  readonly node: string;
  readonly next_self_recheck: string | null;
}

/** The outcome of a single armed node firing during a poll. */
export interface ContinuityFire {
  readonly node: string;
  /** The facets whose `valid_until` had lapsed as of the poll instant. */
  readonly lapsed_facets: readonly Facet[];
  /** The synthetic self-receipt appended to the ledger (the tick). */
  readonly receipt: LedgerReceipt;
  /** The downstream reconciler results from propagating the moved facet(s). */
  readonly propagated: readonly ReconcileResult[];
  /** The re-armed soonest recheck after this fire (the soonest remaining expiry). */
  readonly next_self_recheck: string | null;
}

export interface ContinuityPollResult {
  readonly as_of: string;
  /** The nodes that fired this poll (their `valid_until` had lapsed). */
  readonly fired: readonly ContinuityFire[];
}

/**
 * The clock-driven self-driven cadence loop. Its only state is the per-node armed
 * `next_self_recheck`, re-derivable at boot from the ledger + world-model
 * (architecture.md §8 "the self-driven schedule is recomputable at boot from WM
 * freshness"), so a restart re-arms by calling {@link ContinuityScheduler.arm}
 * once.
 */
export interface ContinuityScheduler {
  /**
   * (Re-)compute every node's armed `next_self_recheck` from its CURRENT freshness
   * state. Idempotent; call once at boot and after any external/forced re-render
   * that may have changed a node's freshness. Returns the per-node armed state.
   */
  readonly arm: () => readonly ArmedRecheck[];
  /** The currently-armed recheck for one node (post-`arm`), or `null` if unarmed. */
  readonly armedFor: (node: string) => string | null;
  /** All currently-armed recheck instants (post-`arm`). */
  readonly armed: () => readonly ArmedRecheck[];
  /**
   * Advance the clock to `as_of`: every armed node whose `next_self_recheck` is
   * `<= as_of` FIRES — the scheduler manufactures the node's synthetic self-receipt
   * (the lapsed facet's fingerprint moved), APPENDS it to the ledger, and PROPAGATES
   * the move to downstream subscribers — then RE-ARMS from the soonest remaining
   * expiry. Nodes not yet due stay asleep (the forecast `sleep` outcome costs
   * nothing — no receipt is manufactured).
   *
   * Firing order is by ascending `next_self_recheck` (then node id) so a chain of
   * expiries fires deterministically.
   */
  readonly poll: (as_of: string) => ContinuityPollResult;
}

/** Build the continuity scheduler over a mounted DAG. */
export function createContinuityScheduler(
  input: ContinuitySchedulerInput,
): ContinuityScheduler {
  const armedByNode = new Map<string, string | null>();

  const armOne = (node: string): string | null => {
    const next = computeNextRecheck(input.readFreshness, node);
    armedByNode.set(node, next);
    return next;
  };

  const arm = (): readonly ArmedRecheck[] =>
    input.nodes.map((node) => ({ node, next_self_recheck: armOne(node) }));

  const poll = (as_of: string): ContinuityPollResult => {
    const due = dueNodes(input.nodes, armedByNode, as_of);
    const fired: ContinuityFire[] = [];
    for (const node of due) {
      const schedule = input.readFreshness(node);
      const decision =
        schedule === null ? null : evaluateContinuityTick({ as_of, schedule });
      if (decision === null || decision.outcome === "sleep") {
        // Freshness moved between arm and poll (an interleaving external render
        // refreshed it): re-arm to the now-soonest expiry, fire nothing.
        armedByNode.set(node, decision?.next_self_recheck ?? null);
        continue;
      }
      fired.push(
        fire(input.dag, input.topology, node, schedule as ContinuitySchedule, decision),
      );
      armedByNode.set(node, decision.next_self_recheck);
    }
    return { as_of, fired };
  };

  return {
    arm,
    armedFor: (node) => armedByNode.get(node) ?? null,
    armed: () =>
      input.nodes.map((node) => ({
        node,
        next_self_recheck: armedByNode.get(node) ?? null,
      })),
    poll,
  };
}

// ---------------------------------------------------------------------------
// The fire — append the synthetic self-receipt + propagate the freshness move
// ---------------------------------------------------------------------------

function fire(
  dag: MountedDag,
  topology: ReconcilerTopology,
  node: string,
  schedule: ContinuitySchedule,
  decision: Extract<ContinuityTickResult, { outcome: "self-receipt" }>,
): ContinuityFire {
  // The tick IS the receipt (world-model.md §5): append the synthetic self-receipt
  // the forecast math produced. The ledger re-stamps + verifies it on append, so a
  // malformed body throws here — the cadence stays as trustworthy as a render.
  const wakeRef = dag.ledger.append(decision.receipt);

  // The freshness move is exactly the lapsed facets' fingerprints moving. Compute
  // the moved set against the PRIOR published fingerprints (the schedule's
  // per-facet tokens before the lapse) so propagation targets only the genuinely
  // moved facets (world-model.md §8: only a moved fingerprint propagates).
  const priorFingerprints = scheduleFingerprints(schedule);
  const movedFacets = movedFacetsBetween(
    priorFingerprints,
    decision.receipt.fingerprints,
  );

  // Resolve + drive the downstream wakes (the same propagation path an ordinary
  // upstream change takes — no special clock path in the reconciler).
  const targets = propagationTargets({
    topology: topology.topology,
    producer: node,
    movedFacets,
    wakeRef,
  });
  const propagated = targets.length > 0 ? dag.reconciler.drain(targets) : [];

  return {
    node,
    lapsed_facets: decision.lapsed_facets,
    receipt: decision.receipt,
    propagated,
    next_self_recheck: decision.next_self_recheck,
  };
}

// ---------------------------------------------------------------------------
// The async sibling (Phase-1 live agent renders; awaits downstream renders)
// ---------------------------------------------------------------------------

export interface AsyncContinuityScheduler {
  readonly arm: () => readonly ArmedRecheck[];
  readonly armedFor: (node: string) => string | null;
  readonly armed: () => readonly ArmedRecheck[];
  readonly poll: (as_of: string) => Promise<ContinuityPollResult>;
}

/**
 * The async continuity scheduler — identical cadence math + synthetic-receipt
 * append, but downstream propagation is driven through `drainAsync` so the woken
 * subscribers can be live agent renders (one bounded session each), awaited fully
 * before the next due node fires (serialized, mirroring `drainAsync`'s
 * single-flight discipline).
 */
export function createAsyncContinuityScheduler(
  input: ContinuitySchedulerInput,
): AsyncContinuityScheduler {
  const armedByNode = new Map<string, string | null>();

  const armOne = (node: string): string | null => {
    const next = computeNextRecheck(input.readFreshness, node);
    armedByNode.set(node, next);
    return next;
  };

  const arm = (): readonly ArmedRecheck[] =>
    input.nodes.map((node) => ({ node, next_self_recheck: armOne(node) }));

  const poll = async (as_of: string): Promise<ContinuityPollResult> => {
    const due = dueNodes(input.nodes, armedByNode, as_of);
    const fired: ContinuityFire[] = [];
    for (const node of due) {
      const schedule = input.readFreshness(node);
      const decision =
        schedule === null ? null : evaluateContinuityTick({ as_of, schedule });
      if (decision === null || decision.outcome === "sleep") {
        armedByNode.set(node, decision?.next_self_recheck ?? null);
        continue;
      }
      fired.push(
        await fireAsync(
          input.dag,
          input.topology,
          node,
          schedule as ContinuitySchedule,
          decision,
        ),
      );
      armedByNode.set(node, decision.next_self_recheck);
    }
    return { as_of, fired };
  };

  return {
    arm,
    armedFor: (node) => armedByNode.get(node) ?? null,
    armed: () =>
      input.nodes.map((node) => ({
        node,
        next_self_recheck: armedByNode.get(node) ?? null,
      })),
    poll,
  };
}

async function fireAsync(
  dag: MountedDag,
  topology: ReconcilerTopology,
  node: string,
  schedule: ContinuitySchedule,
  decision: Extract<ContinuityTickResult, { outcome: "self-receipt" }>,
): Promise<ContinuityFire> {
  const wakeRef = dag.ledger.append(decision.receipt);
  const priorFingerprints = scheduleFingerprints(schedule);
  const movedFacets = movedFacetsBetween(
    priorFingerprints,
    decision.receipt.fingerprints,
  );
  const targets = propagationTargets({
    topology: topology.topology,
    producer: node,
    movedFacets,
    wakeRef,
  });
  const propagated =
    targets.length > 0 ? await dag.reconciler.drainAsync(targets) : [];
  return {
    node,
    lapsed_facets: decision.lapsed_facets,
    receipt: decision.receipt,
    propagated,
    next_self_recheck: decision.next_self_recheck,
  };
}

// ---------------------------------------------------------------------------
// internals — the forecast-math bridge
// ---------------------------------------------------------------------------

/**
 * The soonest `next_self_recheck` a node should arm against, read off its current
 * freshness via the forecast math. We evaluate the tick "in the far past" (no
 * facet lapsed) so the result is the pure `sleep` outcome carrying the soonest
 * future `valid_until` — i.e. the arming instant — without manufacturing a tick.
 */
function computeNextRecheck(
  readFreshness: NodeFreshnessReader,
  node: string,
): string | null {
  const schedule = readFreshness(node);
  if (schedule === null) {
    return null;
  }
  const result = evaluateContinuityTick({ as_of: EPOCH_INSTANT, schedule });
  return result.next_self_recheck;
}

/** The schedule's per-facet published fingerprints (the unmoved tokens, pre-lapse). */
function scheduleFingerprints(schedule: ContinuitySchedule): FingerprintMap {
  const out: Record<Facet, string> = {};
  for (const facet of schedule.facets) {
    out[facet.facet] = facet.fingerprint;
  }
  return out;
}

function dueNodes(
  nodes: readonly string[],
  armedByNode: ReadonlyMap<string, string | null>,
  as_of: string,
): readonly string[] {
  const asOfMs = Date.parse(as_of);
  if (!Number.isFinite(asOfMs)) {
    throw new Error("poll `as_of` must be a replayable instant");
  }
  return nodes
    .filter((node) => {
      const armed = armedByNode.get(node) ?? null;
      if (armed === null) {
        return false;
      }
      const armedMs = Date.parse(armed);
      if (!Number.isFinite(armedMs)) {
        throw new Error(`armed recheck for "${node}" is not a replayable instant`);
      }
      return armedMs <= asOfMs;
    })
    .sort((left, right) => {
      const leftMs = Date.parse(armedByNode.get(left) as string);
      const rightMs = Date.parse(armedByNode.get(right) as string);
      if (leftMs !== rightMs) {
        return leftMs - rightMs;
      }
      return left < right ? -1 : left > right ? 1 : 0;
    });
}

// A replayable far-past instant: evaluating a schedule as-of this never lapses a
// real future `valid_until`, so the tick result is the pure soonest-expiry probe.
const EPOCH_INSTANT = "1970-01-01T00:00:00.000Z";
