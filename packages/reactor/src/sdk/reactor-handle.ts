// The typed `Reactor` running handle — the ONE object a driver holds.
//
// `mountDag` (mounted-dag.ts) wires the dumb reconciler over a world-model store
// + a receipt ledger and exposes SIX co-equal drive verbs (sync `ingest`/`tick`/
// `drain` + their `*Async` siblings) plus the raw `reconciler` primitive. That
// shape is honest but low-altitude: a consumer wanting "deliver an input, settle
// to a fixpoint, read the ledger/store" had to reach through `.dag` and cast to
// the un-surfaced `store`/`ledger` accessors (the reference CLI's ~11
// `as unknown as { store }` / `(reactor as { dag }).dag` casts).
//
// THIS module hoists the run-phase surface onto ONE typed `Reactor` interface:
//
//   - drive verbs are ASYNC-BY-DEFAULT (the live path — a real render IS one
//     bounded LLM session = one `await`). A sync render is trivially an
//     already-resolved promise (mounted-dag.ts:90-98), so the async verbs subsume
//     the sync ones losslessly.
//   - the SYNC verbs (the deterministic fake-render / test path) are preserved
//     verbatim behind `handle.sync` — never amputated, just demoted from co-equal
//     to a named door.
//   - observe accessors (`ledger` / `store` / `clock` / `topology`) are
//     FIRST-CLASS — no casts.
//   - `scheduler(readFreshness)` wires the self-driven continuity cadence off the
//     handle (it already holds the dag + topology the scheduler needs).
//
// The full reconciler primitive (`ReconcilerHandle`) is NOT on this handle — it
// is engine-room altitude and stays reachable via `@openprose/reactor/internals`
// (same home as the rest of the reconciler-construction spine). A power user
// re-hosting the loop reaches it there.
//
// Source of truth: architecture.md §4.1 (reconciler), §4.2 (continuity), §5.1
// (ledger), §5.2 (world-model store), §8 (boot); the API ideal-surface plan §3.5
// (one typed handle; the casts vanish) + §3.3 (the facade returns this handle).

import type { Wake } from "../shapes";
import { createBudgetTracker, type ReactorBudget } from "../cost/budget";
import type {
  ReconcileResult,
  ReconcilerTopology,
  WakeEvent,
} from "../reactor";
import type { LedgerReceipt } from "../receipt";
import type { ReactorClockAdapter } from "../adapters/types";
import type { WorldModelStore, WorldModelFiles } from "../world-model";
import type { MountedDag, MutableReceiptLedger } from "./mounted-dag";
import { observe, type ReactorView } from "./observe";
import {
  createAsyncContinuityScheduler,
  type AsyncContinuityScheduler,
  type NodeFreshnessReader,
} from "./continuity-scheduler";
import type { IngressStager } from "./ingress";

// ---------------------------------------------------------------------------
// The drive-verb inputs (shared sync/async)
// ---------------------------------------------------------------------------

/**
 * The ingress payload for {@link Reactor.ingest}. The bare `{ wake }` form
 * delivers a raw wake (the advanced path); the `{ data }` form folds the
 * phantom-ingress stage-and-move dance into one call (ingress.ts): the payload is
 * staged into the node's `<node>::ingress` truth — moving its `input_fingerprints`
 * — and then a memo-MISS external wake fires so the node re-renders reading the
 * staged input.
 *
 * The `{ data }` form requires an armed ingress stager (the `reactor()` facade
 * wires one, augmenting the topology with the node's phantom-ingress edge). A
 * handle assembled WITHOUT a stager throws a legible error on `{ data }` rather
 * than silently dropping the payload — deliver a raw `{ wake }` instead.
 */
export interface IngestInput {
  /** The wake to deliver. Defaults to a full external wake `{ source: "external", refs: [] }`. */
  readonly wake?: Wake;
  /**
   * The input payload to STAGE for the node (the ingress-arming path): a files map
   * (`{ "in.txt": bytes }`) written into the node's phantom-ingress truth so the
   * subsequent wake is a memo-MISS. Requires an armed stager (see the doc above).
   */
  readonly data?: WorldModelFiles;
}

// ---------------------------------------------------------------------------
// The sync drive surface (the deterministic fake-render / test path)
// ---------------------------------------------------------------------------

/**
 * The SYNCHRONOUS drive verbs — the deterministic fake-render / test path. These
 * are the exact sync `ingest`/`tick`/`drain` + boot the mounted DAG always had,
 * preserved verbatim behind an explicit door (never amputated). Live drive is
 * async-by-default on the handle itself; this surface is for callers who render
 * synchronously (fake renders, replay, deterministic tests).
 */
export interface SyncDriveSurface {
  /** Deliver a wake for a node and reconcile to a fixpoint, synchronously. */
  readonly ingest: (
    node: string,
    input?: IngestInput,
  ) => readonly ReconcileResult[];
  /** Emit a self-sourced wake for a node and reconcile, synchronously. */
  readonly tick: (node: string) => readonly ReconcileResult[];
  /** Drain an arbitrary set of seed wakes, synchronously. */
  readonly drain: (
    seeds: readonly WakeEvent[],
  ) => readonly ReconcileResult[];
  /** Run the boot cold-miss sweep synchronously (architecture.md §8). */
  readonly boot: () => readonly ReconcileResult[];
}

// ---------------------------------------------------------------------------
// The typed Reactor handle
// ---------------------------------------------------------------------------

/**
 * The typed `Reactor` running handle — the return of `reactor()` /
 * `createReactor()` / `runProject()`. ONE object graph at multiple altitudes,
 * never two parallel APIs. Drive verbs are async-by-default (the live path); the
 * deterministic sync verbs live behind {@link Reactor.sync}.
 */
export interface Reactor {
  // ── drive — async-by-default (the live path) ──
  /**
   * Deliver an input for a node and reconcile to a fixpoint (memo/skip, schedule,
   * commit, propagate; architecture.md §4.1). The wake defaults to a full external
   * wake. Awaits the live agent render(s) the wake reaches.
   */
  readonly ingest: (
    node: string,
    input?: IngestInput,
  ) => Promise<readonly ReconcileResult[]>;
  /** Emit a self-sourced wake for a node — the continuity cadence (architecture.md §4.2). */
  readonly tick: (node: string) => Promise<readonly ReconcileResult[]>;
  /** Drain an arbitrary set of seed wakes (e.g. a boot cold-miss sweep). */
  readonly drain: (
    seeds: readonly WakeEvent[],
  ) => Promise<readonly ReconcileResult[]>;
  /**
   * Run the boot cold-miss sweep (architecture.md §8): seed a wake at every SOURCE
   * node and drain to a fixpoint. A cold node renders once; a node that already
   * has a receipt (a restart) memo-skips. Boot is NOT run at construction — call
   * this to run it (so a caller can inspect the cold state first).
   */
  readonly boot: () => Promise<readonly ReconcileResult[]>;

  // ── observe — first-class read accessors (no casts) ──
  /**
   * The unified read view over this reactor's receipt trail — the per-node chain
   * index, the disposition tallies, and the ONE cost rollup ("cost scales with
   * surprise"). Re-derived on each read off the live ledger, so a fresh read
   * always reflects the current trail. The single read-and-rollup surface every
   * consumer (the `serve` line, the HTTP cost endpoint, DevTools) shares.
   */
  readonly view: ReactorView;
  /**
   * Subscribe to each receipt as the reconciler appends it (the ledger-is-
   * telemetry tap). Returns an unsubscribe function. Fires for every committed
   * receipt — `rendered` (real spend), `skipped` (memo hit), and `failed` —
   * across every drive verb. Load-bearing for live observers and the
   * per-fixpoint-step convergence hook.
   */
  onReceipt(cb: (receipt: LedgerReceipt) => void): () => void;
  /** The durable receipt ledger (re-derived from storage at construction). */
  readonly ledger: MutableReceiptLedger;
  /** The world-model store the DAG commits to (the canonical maintained truth). */
  readonly store: WorldModelStore;
  /** The clock the system reads time from (the only time source). */
  readonly clock: ReactorClockAdapter;
  /**
   * The compiled topology the reactor was mounted over. Load-bearing for the
   * self-driven {@link Reactor.scheduler} (it threads the topology) and for the
   * reserved `createEpochDriver` seam (§5.7).
   */
  readonly topology: ReconcilerTopology;
  /**
   * EXPERIMENT A — the Workflow-shaped fresh-token budget accessor:
   * `budget.total` / `budget.spent()` / `budget.remaining()`. With no budget
   * configured, `total` is `null` and `remaining()` is `Infinity` (unlimited).
   * `spent()` is SESSION-scoped (0 at assembly): a restarted reactor over the
   * same durable ledger starts a fresh ceiling.
   */
  readonly budget: ReactorBudget;

  // ── self-driven cadence — wired off the handle ──
  /**
   * Build the self-driven continuity scheduler over this reactor, reading
   * per-node freshness via the supplied {@link NodeFreshnessReader}. The handle
   * already holds the dag + topology the scheduler needs, so the caller no longer
   * threads them (or casts to reach the un-surfaced `.dag`).
   */
  readonly scheduler: (
    readFreshness: NodeFreshnessReader,
    nodes: readonly string[],
  ) => AsyncContinuityScheduler;

  // ── sync drive — the deterministic test path, behind an explicit door ──
  /** The synchronous drive verbs (the deterministic fake-render / test path). */
  readonly sync: SyncDriveSurface;
}

// ---------------------------------------------------------------------------
// The builder — adapt a mounted DAG + substrate into the typed handle
// ---------------------------------------------------------------------------

/** The pieces {@link assembleReactor} wires into the typed handle. */
export interface AssembleReactorInput {
  /** The mounted run-phase DAG (the drive verbs + reconciler). */
  readonly dag: MountedDag;
  /** The clock (the only time source). */
  readonly clock: ReactorClockAdapter;
  /** The compiled topology the DAG was mounted over (for the scheduler + boot seeds). */
  readonly topology: ReconcilerTopology;
  /** The boot cold-miss seed wakes (architecture.md §8). */
  readonly bootSeeds: readonly WakeEvent[];
  /**
   * The ingress stager that delivers a `Reactor.ingest({ data })` payload (ingress.ts).
   * When omitted, `ingest({ data })` throws a legible error (no armed ingress); the
   * `reactor()` facade wires one over the substrate's store + ledger.
   */
  readonly stage?: IngressStager;
}

/**
 * Adapt a mounted DAG + its substrate into the typed {@link Reactor} handle. The
 * async drive verbs forward to the DAG's `*Async` path; the sync verbs forward to
 * the DAG's synchronous path behind `.sync`. Boot drains the supplied seeds.
 */
export function assembleReactor(input: AssembleReactorInput): Reactor {
  const { dag, clock, topology, bootSeeds, stage } = input;

  // Resolve the ingress: stage a `{ data }` payload into the node's phantom-ingress
  // truth (moving its `input_fingerprints`) BEFORE the wake, so the subsequent
  // ingest is a memo-MISS and the node re-renders reading the staged input
  // (ingress.ts). Returns the wake to deliver. With no `data`, this is the bare
  // wake. The `Wake` shape carries no payload slot, so `{ data }` REQUIRES an armed
  // stager — fail loudly rather than silently drop the input.
  const ingestWake = (node: string, i: IngestInput | undefined): Wake | undefined => {
    if (i?.data !== undefined) {
      if (stage === undefined) {
        throw new TypeError(
          "Reactor.ingest({ data }) requires an armed ingress stager to deliver the payload; " +
            "use the reactor() facade (it arms one), or deliver a raw { wake }.",
        );
      }
      stage(node, i.data);
    }
    return i?.wake;
  };

  // The ledger-is-telemetry tap: wrap `append` ONCE so every reconciler-committed
  // receipt fans out to subscribers (the reconciler appends through this same
  // ledger instance, so wrapping it here catches every drive verb). `append`
  // returns the content address (the `prev` pointer), so the fan-out happens
  // after the durable append succeeds.
  const subscribers = new Set<(receipt: LedgerReceipt) => void>();
  const ledger = dag.ledger;
  const innerAppend = ledger.append.bind(ledger);
  // The trail is `LedgerReceipt[]`; `append` takes a `Receipt` and stamps it.
  // After append, the freshly-stamped `LedgerReceipt` is the trail's last entry.
  (ledger as { append: MutableReceiptLedger["append"] }).append = (receipt) => {
    const ref = innerAppend(receipt);
    if (subscribers.size > 0) {
      const all = ledger.all();
      const stamped = all[all.length - 1];
      if (stamped !== undefined) {
        for (const cb of subscribers) {
          cb(stamped);
        }
      }
    }
    return ref;
  };

  const handle: Reactor = {
    // async-by-default
    ingest: (node, i) => dag.ingestAsync(node, ingestWake(node, i)),
    tick: (node) => dag.tickAsync(node),
    drain: (seeds) => dag.drainAsync(seeds),
    boot: () => dag.drainAsync(bootSeeds),

    // observe accessors
    get view(): ReactorView {
      return observe(handle);
    },
    onReceipt: (cb) => {
      subscribers.add(cb);
      return () => {
        subscribers.delete(cb);
      };
    },
    ledger,
    store: dag.store,
    clock,
    topology,
    // `mountDag` always supplies the budget view; a hand-assembled structural
    // `MountedDag` without one gets the unlimited view (total null / Infinity).
    budget: dag.budget ?? createBudgetTracker().view,

    // self-driven cadence
    scheduler: (readFreshness, nodes) =>
      createAsyncContinuityScheduler({ dag, topology, nodes, readFreshness }),

    // sync drive (deterministic test path)
    sync: {
      ingest: (node, i) => dag.ingest(node, ingestWake(node, i)),
      tick: (node) => dag.tick(node),
      drain: (seeds) => dag.drain(seeds),
      boot: () => dag.drain(bootSeeds),
    },
  };
  return handle;
}

// ===========================================================================
// RESERVED FORWARD SEAM (type-only; nothing built ahead) — the epoch driver
// ===========================================================================
//
// Decision #5 (API-CHANGE-PLAN §2; API-ANALYSIS §5.7): the FIXPOINT's epoch
// rollover lands as a STRICTLY-ADDITIVE SIBLING `createEpochDriver(reactor, …)`
// layered OVER the fixed-topology {@link Reactor} — NOT a reshape of `mountDag`
// / `createReactor` (delta.md's "reshape mountDag" wording is explicitly
// overridden). The {@link Reactor} handle ALREADY exposes everything a
// `rollAtQuiescence` loop needs: `topology` (the current epoch), `drain` (settle
// to a fixpoint), and `onReceipt` (observe quiescence) — so re-snapshotting the
// topology at quiescence forces NO breaking change later.
//
// Declared, NOT built: these are TYPE-ONLY shapes. No `createEpochDriver`
// VALUE/implementation ships in `0.3.0`. They reserve the names + contract so
// the milestone is a pure additive landing. Reachable from
// `@openprose/reactor/internals`.

/**
 * RESERVED (type-only). The compile-phase input the future epoch driver
 * re-derives the topology from at each rollover. `forme` is the compile render
 * that produces a fresh {@link ReconcilerTopology}; the milestone fixes its
 * concrete shape (left `unknown` so it can be fixed without a breaking widening).
 */
export interface ReservedEpochDriverInput {
  readonly forme: unknown;
}

/**
 * RESERVED (type-only). The handle the future `createEpochDriver` would return:
 * a sibling loop that, at each quiescence, re-snapshots the topology (the new
 * epoch) and re-drives the fixed-topology {@link Reactor}. Declared so the
 * milestone adds the implementation without reshaping any v1 type.
 */
export interface ReservedEpochDriver {
  /** The reactor this driver is layered over (the fixed-topology run handle). */
  readonly reactor: Reactor;
  /**
   * Roll to the next epoch once the current one reaches quiescence: re-derive the
   * topology from `forme`, then re-drive. RESERVED — declared, not built.
   */
  readonly rollAtQuiescence: () => Promise<readonly ReconcileResult[]>;
}

/**
 * RESERVED (type-only). The signature the future strictly-additive
 * `createEpochDriver` sibling will satisfy: `(reactor, { forme }) =>
 * EpochDriver`, layered over the fixed-topology {@link Reactor}. No VALUE is
 * exported in `0.3.0` — this reserves the contract so the FIXPOINT milestone
 * lands additively (decision #5).
 */
export type ReservedCreateEpochDriver = (
  reactor: Reactor,
  input: ReservedEpochDriverInput,
) => ReservedEpochDriver;
