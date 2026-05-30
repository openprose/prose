// createReactor — the keystone assembler (gap-audit 00-INVENTORY #9; the
// reorganized build plan Phase 2 "the assembled runtime").
//
// `mountDag` (mounted-dag.ts) is the run-phase FRONT DOOR, but it DEFAULTS to an
// in-memory world-model store + an in-memory receipt ledger — nothing in
// non-test code constructs the durable substrates. This module is the SYSTEM
// CONSTRUCTOR that wires the durable pieces together: it injects
//
//   - the durable FS world-model store (or any injected `WorldModelStore`),
//   - a PERSISTED receipt ledger (the `FileSystemReceiptLedger`, re-derived from
//     the storage adapter's durable trail — fs-ledger.ts),
//   - a clock (the only time source, architecture.md §5.3), and
//   - the per-node render bodies (sync `mounts` and/or the Phase-1 async
//     agent-render `asyncMounts`),
//
// assembling the `mountDag` run-phase surface, and then runs the BOOT /
// COLD-MISS SWEEP so state survives a restart.
//
// Source of truth:
//   - architecture.md §5.3 (L266–L271): the v1 adapter surface — clock, storage,
//     modelGateway + agentSdk, connectors. The assembler is the place those
//     injected ports become one running system ("Keep the harness a pure
//     function over injected I/O").
//   - architecture.md §8 (L379–L383) "Boot cold-start": nodes with no prior
//     receipt are cold misses; they render once when their inputs are available.
//     Boot proceeds in topological order: gateways / self-driven nodes fire and
//     propagate; input-driven nodes wait for their first upstream receipt. A
//     one-time warm-up, not a per-tick cost.
//   - architecture.md §8 (L391–L392): reconciler dirty/coalesce state is
//     re-derived from the ledger on crash — the durable ledger (fs-ledger.ts) is
//     the source of truth a restart re-opens.
//   - gap-audit 00-INVENTORY #9/#10: the constructor + persistence wiring that
//     "blocks any assembled runtime" / "blocks restart-survival".

import type { Wake, WakeSource } from "../shapes";
import {
  inboundEdges,
  type ReconcilerTopology,
  type WakeEvent,
  type ReconcileResult,
} from "../reactor";
import type { WorldModelStore } from "../world-model";
import { FileSystemWorldModelStore } from "../world-model/fs-store";
import type { ReactorClockAdapter, ReactorStorageAdapter } from "../adapters/types";
import {
  mountDag,
  type AsyncNodeMount,
  type MountedDag,
  type MutableReceiptLedger,
  type NodeMount,
} from "./mounted-dag";
import {
  createFileSystemReceiptLedger,
} from "./fs-ledger";

/**
 * The assembler's injected substrate. Mirrors the architecture.md §5.3 adapter
 * surface, narrowed to what the run-phase keystone needs: a `clock`, a durable
 * `storage` adapter (the ledger's append-only trail), and a `worldModel` store.
 * The render bodies (the language layer / agent-render spawn) arrive on
 * {@link CreateReactorInput} as `mounts` / `asyncMounts` so the SAME assembler
 * serves a fake-render test DAG and a live-agent DAG.
 */
export interface ReactorRuntimeAdapters {
  /** The only time source (architecture.md §5.3). */
  readonly clock: ReactorClockAdapter;
  /**
   * The durable storage adapter the receipt ledger appends through and
   * re-derives from at boot (architecture.md §5.1 / §8). In production this is
   * the filesystem `storage-fs` adapter.
   */
  readonly storage: ReactorStorageAdapter;
  /**
   * The world-model store. Defaults to a fresh durable
   * `FileSystemWorldModelStore` over {@link CreateReactorInput.directory} when
   * omitted; inject an explicit store (e.g. in-memory) for tests.
   */
  readonly worldModel?: WorldModelStore;
}

export interface CreateReactorInput {
  /** The injected durable substrate (clock + storage + optional world-model store). */
  readonly adapters: ReactorRuntimeAdapters;
  /** The compiled topology (Forme's output) + per-node contract fingerprints. */
  readonly topology: ReconcilerTopology;
  /** The SYNC render body per node identity (the test/fake path). */
  readonly mounts?: Readonly<Record<string, NodeMount>>;
  /**
   * The ASYNC render body per node identity (the Phase-1 live agent-render
   * spawn). Mounted via `mountDag`'s async spawn and driven through the async
   * boot sweep.
   */
  readonly asyncMounts?: Readonly<Record<string, AsyncNodeMount>>;
  /**
   * The directory the default `FileSystemWorldModelStore` persists under, when
   * `adapters.worldModel` is not supplied. Required iff the world-model store is
   * defaulted.
   */
  readonly directory?: string;
}

/**
 * The assembled reactor: the `mountDag` run-phase surface plus the durable
 * substrates it was wired over, plus the boot sweep. Boot is NOT run in the
 * constructor (so a caller can inspect the cold state first); call `boot()` /
 * `bootAsync()` to run the cold-miss sweep.
 */
export interface AssembledReactor {
  /** The mounted run-phase DAG (ingest / tick / drain + their async siblings). */
  readonly dag: MountedDag;
  /** The durable receipt ledger (re-derived from storage at construction). */
  readonly ledger: MutableReceiptLedger;
  /** The world-model store the DAG commits to. */
  readonly store: WorldModelStore;
  /** The clock the system reads time from. */
  readonly clock: ReactorClockAdapter;
  /**
   * The SYNC boot / cold-miss sweep (architecture.md §8). Seeds a wake at every
   * SOURCE node (gateways / self-driven / no-inbound-edge roots) in topological
   * order and drains to a fixpoint: a cold node renders once; a node that
   * already has a receipt (a restart) memo-skips. Returns the per-node results.
   */
  readonly boot: () => readonly ReconcileResult[];
  /** The ASYNC boot sweep — the same seeds drained through the async path (live agent renders). */
  readonly bootAsync: () => Promise<readonly ReconcileResult[]>;
}

/**
 * Assemble a reactor over durable substrates (the keystone, gap-audit #9). Wires
 * the FS world-model store + a persisted receipt ledger + clock + the per-node
 * render bodies into the `mountDag` run-phase surface, and exposes the boot /
 * cold-miss sweep (architecture.md §8) so state survives a restart.
 *
 * Restart-survival: construct a second `createReactor` over the SAME `storage`
 * adapter (re-opened on the same directory) + the SAME world-model `directory`,
 * and the durable ledger re-derives every node's last receipt — so `boot()`
 * memo-skips the unchanged nodes instead of re-rendering them.
 */
export function createReactor(input: CreateReactorInput): AssembledReactor {
  const { adapters, topology } = input;

  const store = adapters.worldModel ?? defaultWorldModelStore(input);

  // The PERSISTED receipt ledger — re-derived from the durable trail at
  // construction (fs-ledger.ts; architecture.md §8 "the ledger is the source of
  // truth"). THIS is the wiring gap-audit #10 names: the FS receipt log becomes
  // a `ReceiptLedgerPort`/`MutableReceiptLedger`.
  const ledger = createFileSystemReceiptLedger({ storage: adapters.storage });

  const dag = mountDag({
    topology,
    mounts: input.mounts ?? {},
    ...(input.asyncMounts !== undefined ? { asyncMounts: input.asyncMounts } : {}),
    store,
    ledger,
  });

  const seeds = bootSeeds(topology);

  return {
    dag,
    ledger,
    store,
    clock: adapters.clock,
    boot: () => dag.drain(seeds),
    bootAsync: () => dag.drainAsync(seeds),
  };
}

// ---------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------

function defaultWorldModelStore(input: CreateReactorInput): WorldModelStore {
  const directory = input.directory;
  if (typeof directory !== "string" || directory.length === 0) {
    throw new TypeError(
      "createReactor requires either adapters.worldModel or a `directory` for the default FileSystemWorldModelStore",
    );
  }
  return new FileSystemWorldModelStore({ directory });
}

/**
 * The boot cold-miss seeds (architecture.md §8). A node is a boot SOURCE when it
 * has no inbound subscription edges (a gateway / self-driven root / external
 * ingress) — these fire first and propagate; input-driven nodes wait for their
 * first upstream receipt, which propagation delivers. Seeding only the sources
 * (not every node) keeps boot a topological warm-up: the reconciler's
 * propagation cascades the rest in dependency order, and any node that already
 * has a receipt (a restart) memo-skips. The wake source per seed is read off the
 * topology node's declared `wake_source` so a self-driven root boots with a
 * `self` wake and a gateway with an `external` wake.
 */
function bootSeeds(topology: ReconcilerTopology): readonly WakeEvent[] {
  const wakeSourceFor = new Map<string, WakeSource>();
  for (const node of topology.topology.nodes) {
    wakeSourceFor.set(node.node, node.wake_source);
  }

  const seeds: WakeEvent[] = [];
  for (const node of topology.topology.nodes) {
    const hasInbound = inboundEdges(topology.topology, node.node).length > 0;
    if (hasInbound) {
      // An input-driven node waits for its first upstream receipt; propagation
      // from the seeded sources delivers it. Do NOT seed it directly.
      continue;
    }
    seeds.push({
      node: node.node,
      wake: bootWake(wakeSourceFor.get(node.node) ?? "external"),
    });
  }
  return seeds;
}

function bootWake(source: WakeSource): Wake {
  return { source, refs: [] };
}
