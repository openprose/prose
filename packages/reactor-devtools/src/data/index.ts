// The DATA LAYER — the only place this package reads from `@openprose/reactor`.
//
// Replay-first (plan §1.3 / §5.2): point at a saved `<state-dir>` and produce the
// single, serializable payload the SPA renders. Everything here is a READ of what
// the SDK already persists — ordering / per-node chains / moved-facet diff / cost
// rollup all come from the SDK's `createReplaySession`; topology is read from the
// saved `<state-dir>/compile/topology.json`. We re-derive NOTHING the SDK derives.
//
// How a state-dir is opened (verified against the v0.2.0 SDK read surface):
//   - `createFileSystemStorageAdapter({ directory })` (root `@openprose/reactor`,
//     via `export * from "./adapters"`) opens the durable trail (a single
//     `receipts.json` under the dir — NOT a `receipts/` subdir; the plan's
//     "receipts/" wording predates the storage-fs layout).
//   - `new FileSystemReceiptLedger({ storage })` (`@openprose/reactor/sdk`)
//     re-derives `all()` from that trail — THAT is replay.
//   - `createReplaySession({ ledger })` (`@openprose/reactor/sdk`) shapes the
//     ordered receipts + per-node chain index + per-receipt moved-facet diff +
//     fresh/reused/$ cost rollup.
//   - topology comes from `<state-dir>/compile/topology.json` (typed
//     `TopologyWorldModel`); `MountedDag` has NO `.topology` field in replay.
//   - S4 click-through (nice-to-have) uses `FileSystemWorldModelStore`
//     (`@openprose/reactor/world-model`) `.readVersion(node, version)` where
//     `version === receipt.fingerprints["@atomic"]` (R3 resolved).

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import {
  createReplaySession,
  propagationTargets,
  FileSystemReceiptLedger,
  verifyReceiptChain,
  ATOMIC_FACET,
  type ReplaySession,
  type ReplaySessionCostOptions,
  type LedgerReceipt,
  type TopologyWorldModel,
  type ContentAddress,
} from "@openprose/reactor/sdk";
import { createFileSystemStorageAdapter } from "@openprose/reactor";
import { FileSystemWorldModelStore } from "@openprose/reactor/world-model";

/** Options for opening a replayable state directory. */
export interface OpenStateDirOptions {
  /** Coarse $-pricing for the cost rollup (passed through to the ReplaySession). */
  readonly cost?: ReplaySessionCostOptions;
}

/**
 * An opened, replayable state directory: the live SDK handles (kept server-side
 * for click-through) plus the resolved topology. Build the wire payload with
 * {@link buildSnapshot}.
 */
export interface OpenedStateDir {
  /** The absolute (or caller-relative) state directory path. */
  readonly stateDir: string;
  /** The shaped, ordered receipt view from the SDK. */
  readonly session: ReplaySession;
  /**
   * The DAG the SPA draws. In replay this is read from the saved
   * `compile/topology.json`; `null` when the dir has no saved topology (a bare
   * trail — plan R2; the SPA falls back to a node-only set derived from the
   * receipts' distinct `node` values).
   */
  readonly topology: TopologyWorldModel | null;
  /**
   * The world-model store over `<state-dir>/world-models/`, kept server-side for
   * S4 click-through (`GET /api/node/:id?version=` → `readVersion`). `null` when
   * the dir has no `world-models/` directory (a bare trail). Never serialized to
   * the SPA — it holds an I/O handle; the SPA reaches it through the endpoint.
   */
  readonly worldModels: FileSystemWorldModelStore | null;
}

/**
 * Open a saved `<state-dir>` for replay. Pure read: opens the durable trail,
 * re-derives the ledger, shapes a {@link ReplaySession}, and loads the saved
 * topology if present. No model key, no running reactor (plan §1.3).
 */
export function openStateDir(
  stateDir: string,
  options: OpenStateDirOptions = {},
): OpenedStateDir {
  const storage = createFileSystemStorageAdapter({ directory: stateDir });
  const ledger = new FileSystemReceiptLedger({ storage });
  const session = createReplaySession(
    { ledger },
    options.cost ? { cost: options.cost } : {},
  );
  const topology = readTopology(stateDir);
  const worldModels = openWorldModels(stateDir);
  return { stateDir, session, topology, worldModels };
}

/** Read `<state-dir>/compile/topology.json`, or `null` if absent. */
export function readTopology(stateDir: string): TopologyWorldModel | null {
  const path = join(stateDir, "compile", "topology.json");
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, "utf8");
  return JSON.parse(raw) as TopologyWorldModel;
}

/**
 * Open the world-model store over `<state-dir>/world-models/` (the layout
 * `FileSystemWorldModelStore` reads back on a fresh instance), or `null` when
 * absent. Pure read handle; used only by `GET /api/node/:id`.
 */
export function openWorldModels(
  stateDir: string,
): FileSystemWorldModelStore | null {
  const directory = join(stateDir, "world-models");
  if (!existsSync(directory)) return null;
  return new FileSystemWorldModelStore({ directory });
}

// --- Click-through: a receipt's node truth at its version (S4) --------------

/** One file of a node's world-model at a version (bytes decoded to text/base64). */
export interface WorldModelFileView {
  readonly path: string;
  /** UTF-8 text body when the bytes decode cleanly; otherwise `null`. */
  readonly text: string | null;
  /** Base64 of the raw bytes (always present; the SPA can fall back to it). */
  readonly base64: string;
  /** Raw byte length. */
  readonly bytes: number;
}

/** The world-model of a node at a given version, projected for the inspector. */
export interface NodeWorldModelView {
  readonly node: string;
  /** The content-addressed version read (= `receipt.fingerprints["@atomic"]`). */
  readonly version: string;
  /** The published facet → fingerprint map currently on disk for the node. */
  readonly publishedFingerprints: Record<string, string>;
  /** The artifact files at the requested version. */
  readonly files: readonly WorldModelFileView[];
}

const TEXT_DECODER = new TextDecoder("utf-8", { fatal: true });

function decodeText(bytes: Uint8Array): string | null {
  try {
    return TEXT_DECODER.decode(bytes);
  } catch {
    return null;
  }
}

/**
 * Read a node's world-model at a content-addressed version via the store's
 * `readVersion` (R3 resolved: pass `receipt.fingerprints["@atomic"]`). Returns
 * `null` when there is no store, no such node, or no such version. PURE read of
 * the saved `world-models/` dir — no key, no running reactor.
 */
export function readNodeWorldModel(
  opened: OpenedStateDir,
  node: string,
  version: string,
): NodeWorldModelView | null {
  const store = opened.worldModels;
  if (store === null) return null;
  let read;
  try {
    // The URL `version` is a content address by contract (R3: a frame's
    // `atomicVersion` = `fingerprints["@atomic"]`). Cast at this boundary.
    read = store.readVersion(node, version as ContentAddress);
  } catch {
    // `readVersion` asserts the node name; an unknown node is "not found".
    return null;
  }
  if (read === null) return null;

  const files: WorldModelFileView[] = Object.entries(read.files).map(
    ([path, raw]) => {
      const view = raw as Uint8Array;
      return {
        path,
        text: decodeText(view),
        base64: Buffer.from(view).toString("base64"),
        bytes: view.byteLength,
      };
    },
  );

  let publishedFingerprints: Record<string, string> = {};
  try {
    publishedFingerprints = { ...store.publishedFingerprints(node) };
  } catch {
    publishedFingerprints = {};
  }

  return { node, version, publishedFingerprints, files };
}

/**
 * Resolve the world-model `version` for a receipt index in the snapshot: the
 * receipt's `@atomic` fingerprint (R3). Convenience for the SPA, which holds the
 * frame's `atomicVersion` and passes it straight to `GET /api/node/:id?version=`.
 */
export function versionForFrame(frame: ReceiptFrame): string {
  return frame.atomicVersion;
}

// --- The wire payload (what the SPA consumes) -------------------------------

/**
 * One per-facet edge lane to light when a producer's facet moved — the
 * `producer → subscriber` lane for exactly that facet (plan §4: "light the
 * per-facet edges for facet *f* only", proving the selector boundary). The
 * `(producer, subscriber, facet)` triple is index-stable against the snapshot's
 * `edges`.
 */
export interface EdgeLight {
  readonly producer: string;
  readonly subscriber: string;
  readonly facet: string;
}

/** One receipt projected for the SPA, index-aligned with its moved-facet set. */
export interface ReceiptFrame {
  /** Position in the append-order timeline (the scrubber index). */
  readonly index: number;
  /** The graph node this receipt hit (which node to flash / pulse / red). */
  readonly node: string;
  /** `rendered` → flash | `skipped` → dim pulse | `failed` → red. */
  readonly status: LedgerReceipt["status"];
  /** Wake cause — drives the flash hue (input / self / external). */
  readonly wakeSource: LedgerReceipt["wake"]["source"];
  /** The facets that moved vs this node's prior receipt — the edge lanes to light. */
  readonly movedFacets: readonly string[];
  /**
   * The per-facet edges to light this frame: for each MOVED facet of this node
   * (the producer), the topology edges `node → subscriber` on that facet. Only
   * populated for `rendered` receipts whose fingerprints moved — a `skipped`
   * receipt moved nothing and a `failed` receipt copies fingerprints forward, so
   * both light NO edges (plan §4). Empty when there is no saved topology.
   */
  readonly edgesToLight: readonly EdgeLight[];
  /**
   * The DISTINCT downstream nodes woken by this frame — the diamond single-wake.
   * A subscriber reached by ≥2 moved facets of this producer appears EXACTLY
   * ONCE here (computed with the SDK's own `propagationTargets`, which dedupes
   * subscribers the same way the live reconciler does). The SPA flashes each of
   * these once next frame; `edgesToLight` may have more entries than this when a
   * subscriber subscribes on multiple moved facets.
   */
  readonly wokenSubscribers: readonly string[];
  /** Fresh / reused token counts for the meter tick. */
  readonly cost: {
    readonly fresh: number;
    readonly reused: number;
    readonly surpriseCause: LedgerReceipt["cost"]["surprise_cause"];
  };
  /** This receipt's content address (the inspector chain key / `prev` target). */
  readonly contentHash: LedgerReceipt["content_hash"];
  /**
   * The node's world-model version at this receipt — its `@atomic` fingerprint
   * (R3 resolved). The SPA passes this verbatim to `GET /api/node/:id?version=`
   * for click-through. May be absent if a receipt omits `@atomic` (shouldn't
   * happen: the SDK always writes it).
   */
  readonly atomicVersion: string;
}

/** A topology node projected for layout. */
export interface NodeView {
  readonly id: string;
  readonly isEntryPoint: boolean;
}

/** A per-facet topology edge projected for lane rendering. */
export interface EdgeView {
  readonly producer: string;
  readonly subscriber: string;
  readonly facet: string;
}

/** The cumulative fresh/reused/$ rollup, mirrored from the SDK cost rollup. */
export interface CostRollupView {
  readonly byCause: Record<
    string,
    { receipts: number; fresh: number; reused: number; dollars: number }
  >;
  readonly total: { receipts: number; fresh: number; reused: number; dollars: number };
}

/** The single serializable snapshot the server hands the SPA. */
export interface ReplaySnapshot {
  readonly stateDir: string;
  readonly nodes: readonly NodeView[];
  readonly edges: readonly EdgeView[];
  readonly entryPoints: readonly string[];
  readonly acyclic: boolean;
  readonly frames: readonly ReceiptFrame[];
  readonly costRollup: CostRollupView;
  /** True when topology came from a saved `topology.json` (vs. a node-only fallback). */
  readonly hasTopology: boolean;
}

/**
 * Project an {@link OpenedStateDir} into the flat, serializable snapshot the SPA
 * renders. When no saved topology is present, nodes are derived from the
 * receipts' distinct `node` values and edges are empty (plan R2 fallback).
 */
export function buildSnapshot(opened: OpenedStateDir): ReplaySnapshot {
  const { session, topology, stateDir } = opened;

  const frames: ReceiptFrame[] = session.receipts.map((r, index) => {
    const moved = session.movedFacetsByIndex[index]!;
    // Edge lights + diamond single-wake. ONLY a `rendered` receipt that actually
    // moved fingerprints propagates (plan §4): `skipped` moved nothing; `failed`
    // copies fingerprints forward, so its diff is empty anyway — but we gate on
    // status too so a (defensive) non-empty failed diff still lights nothing.
    const { edgesToLight, wokenSubscribers } =
      topology !== null && r.status === "rendered" && moved.size > 0
        ? deriveEdgeLights(topology, r.node, moved, r.content_hash)
        : { edgesToLight: [], wokenSubscribers: [] };

    return {
      index,
      node: r.node,
      status: r.status,
      wakeSource: r.wake.source,
      movedFacets: [...moved],
      edgesToLight,
      wokenSubscribers,
      cost: {
        fresh: r.cost.tokens.fresh,
        reused: r.cost.tokens.reused,
        surpriseCause: r.cost.surprise_cause,
      },
      contentHash: r.content_hash,
      atomicVersion: r.fingerprints[ATOMIC_FACET] ?? "",
    };
  });

  let nodes: NodeView[];
  let edges: EdgeView[];
  let entryPoints: readonly string[];
  let acyclic: boolean;

  if (topology) {
    const entry = new Set(topology.entry_points);
    nodes = topology.nodes.map((n) => ({
      id: n.node,
      isEntryPoint: entry.has(n.node),
    }));
    edges = topology.edges.map((e) => ({
      producer: e.producer,
      subscriber: e.subscriber,
      facet: e.facet,
    }));
    entryPoints = topology.entry_points;
    acyclic = topology.acyclic;
  } else {
    const distinct = new Set(session.receipts.map((r) => r.node));
    nodes = [...distinct].map((id) => ({ id, isEntryPoint: false }));
    edges = [];
    entryPoints = [];
    acyclic = true;
  }

  return {
    stateDir,
    nodes,
    edges,
    entryPoints,
    acyclic,
    frames,
    costRollup: projectCostRollup(session),
    hasTopology: topology !== null,
  };
}

/**
 * Derive the lit edges + the deduped woken subscribers for one producing node's
 * moved facets. The woken set comes from the SDK's `propagationTargets` — the
 * SAME function the live reconciler uses — so the diamond single-wake (a
 * subscriber reached by ≥2 moved facets appears once) is correct BY
 * CONSTRUCTION, not re-implemented here. The lit edges are every matching lane
 * (`producer === node` && `facet ∈ moved`), so a multi-facet subscriber shows
 * each lane while still being woken once.
 */
function deriveEdgeLights(
  topology: TopologyWorldModel,
  node: string,
  moved: ReadonlySet<string>,
  wakeRef: LedgerReceipt["content_hash"],
): { edgesToLight: EdgeLight[]; wokenSubscribers: string[] } {
  const edgesToLight: EdgeLight[] = [];
  for (const edge of topology.edges) {
    if (edge.producer === node && moved.has(edge.facet)) {
      edgesToLight.push({
        producer: edge.producer,
        subscriber: edge.subscriber,
        facet: edge.facet,
      });
    }
  }
  // Reuse the reconciler's own dedup for the single-wake guarantee.
  const targets = propagationTargets({
    topology,
    producer: node,
    movedFacets: moved,
    wakeRef,
  });
  const wokenSubscribers = targets.map((t) => t.node);
  return { edgesToLight, wokenSubscribers };
}

function projectCostRollup(session: ReplaySession): CostRollupView {
  const { byCause, total } = session.costRollup;
  const projectedByCause: CostRollupView["byCause"] = {};
  for (const [cause, bucket] of Object.entries(byCause)) {
    projectedByCause[cause] = {
      receipts: bucket.receipts,
      fresh: bucket.fresh,
      reused: bucket.reused,
      dollars: bucket.dollars,
    };
  }
  return {
    byCause: projectedByCause,
    total: {
      receipts: total.receipts,
      fresh: total.fresh,
      reused: total.reused,
      dollars: total.dollars,
    },
  };
}

// Re-exported so S4 (inspector / chain-verified badge) can build on the same
// data layer without re-importing the SDK directly.
export { verifyReceiptChain };
export type { ReplaySession, LedgerReceipt, TopologyWorldModel };
