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
//     `receipts.json` under the dir — NOT a `receipts/` subdir). This flat
//     root layout is now the ONE canonical state-dir convention: `reactor run`/
//     `serve`/`trigger` write `<state-dir>/receipts.json` here, and the specs
//     were reconciled to match (crosscheck dt-receiptspath-1 / dt-receiptsdir-1;
//     the plan's earlier "receipts/" wording predated the storage-fs layout).
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
  verifyReceipt,
  verifyReceiptChain,
  ATOMIC_FACET,
  createFileSystemStorageAdapter,
  createFileSystemWorldModelStore,
  type ReplaySession,
  type LedgerReceipt,
  type WorldModelStore,
} from "@openprose/reactor";
import {
  FileSystemReceiptLedger,
} from "@openprose/reactor/adapters";
import {
  propagationTargets,
  type ReplaySessionCostOptions,
  type TopologyWorldModel,
  type ContentAddress,
  type Facet,
} from "@openprose/reactor/internals";

/** The chain-verify result shape (the return of `verifyReceiptChain`). */
type ChainResult = ReturnType<typeof verifyReceiptChain>;

/** Options for opening a replayable state directory. */
export interface OpenStateDirOptions {
  /** Coarse $-pricing for the cost rollup (passed through to the ReplaySession). */
  readonly cost?: ReplaySessionCostOptions;
}

// --- Bundled examples + state-dir validation -------------------------------
//
// The flagship keyless command must not use a repo-relative fixture path: after
// `npm i -g` that resolves against the wrong cwd and SILENTLY renders `LEDGER EMPTY`.
// Two guards close that footgun: (1) `--example <name>` resolves a SHIPPED fixture
// internally from this package's own dir so no user ever computes a path; (2) the
// normal `<state-dir>` arg distinguishes does-not-exist / not-a-state-dir from a
// real-but-empty ledger, so a wrong cwd can never masquerade as `LEDGER EMPTY`.

/**
 * The fixtures SHIPPED in the package tarball (the npm `files` list). Only these
 * resolve via `--example`; everything else is repo-only (generate it locally).
 * `masked-relay` is the single replayable state-dir in the tarball.
 */
export const SHIPPED_EXAMPLES: readonly string[] = ["masked-relay"];

/**
 * Resolve a SHIPPED example name to its on-disk state-dir, INTERNALLY — relative
 * to this package's own directory (the same `fixtures/` the package ships in its
 * npm `files`). `dist/data/index.js` → `../../fixtures/<name>` is the package root
 * `fixtures/`. Returns `null` for an unknown name (caller lists the shipped ones).
 * No user ever computes a path.
 */
export function resolveExampleDir(name: string): string | null {
  if (!SHIPPED_EXAMPLES.includes(name)) return null;
  // From dist/data/ up two levels to the package root, then into fixtures/.
  const dir = join(__dirname, "..", "..", "fixtures", name);
  return existsSync(dir) ? dir : null;
}

/**
 * Whether `dir` is a real, openable Reactor state-dir: it must EXIST on disk and
 * carry at least one of the two trail markers — a `receipts.json` (the durable
 * ledger) or a `compile/` directory (a compiled-but-unrun dir). A path that does
 * not exist, or an arbitrary directory with neither marker, is NOT a state-dir —
 * the CLI errors non-zero rather than silently rendering an empty ledger.
 * A real, existing, compiled-but-unrun dir with an empty `receipts.json` still
 * passes here (it has `compile/`), so `LEDGER EMPTY` (exit 0) is reserved for it.
 */
export function isReactorStateDir(dir: string): boolean {
  if (!existsSync(dir)) return false;
  return existsSync(join(dir, "receipts.json")) || existsSync(join(dir, "compile"));
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
   * The RAW on-disk receipts as persisted (`storage.listReceipts()`), with their
   * ORIGINAL `content_hash` bytes intact and in append order.
   *
   * Why this is distinct from `session.receipts`: the replay ledger
   * (`FileSystemReceiptLedger`) RE-STAMPS every persisted receipt through
   * `createReceipt` on rehydrate, which RECOMPUTES `content_hash` from the
   * payload. That is correct for the renderer (it needs a consistent address) but
   * it silently HEALS a tamper — an edited `node`/fingerprint field with a stale
   * on-disk `content_hash` comes back with a fresh, self-consistent hash, so a
   * chain-verify over the re-stamped trail reads green on a tampered ledger (a
   * false ✓ on a trust-first product). Chain-verify must run
   * against THESE raw, as-persisted receipts so the SDK's `verifyReceipt`
   * recomputes the hash and compares it to the on-disk `content_hash`, catching
   * the tamper exactly as `reactor receipts verify` does. `null` for a state-dir
   * with no readable trail (a corrupt/unreadable receipts file — see
   * {@link openStateDir}, which surfaces that as a real error, not empty).
   */
  readonly rawReceipts: readonly unknown[] | null;
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
  readonly worldModels: WorldModelStore | null;
  /**
   * Friendly `nodeId → label` map from `<state-dir>/compile/labels.json`, or
   * `{}` when absent. Carried through to {@link ReplaySnapshot.labels}.
   */
  readonly labels: Record<string, string>;
  /**
   * The optional authored beat map from `<state-dir>/beats.json` — a director's
   * cut of the replay (scenario title + park-frame captions), or `null` when the
   * state-dir has no `beats.json`. Carried through to {@link ReplaySnapshot.beats}
   * so the SPA can PREFER an authored caption on a beat's park frame over the
   * generic computed caption. Pure presentation data per state-dir; the viewer
   * stays generic and unchanged when no `beats.json` is present.
   */
  readonly beats: BeatsMap | null;
}

/** One authored beat of a scenario recording (a park frame + its caption). */
export interface Beat {
  /** Stable beat name (e.g. `"hero-dark-lane"`). */
  readonly name: string;
  /** The receipt index the recording parks on for this beat. */
  readonly park: number;
  /** Inclusive scrub-range start the beat covers. */
  readonly from: number;
  /** Inclusive scrub-range end the beat covers. */
  readonly to: number;
  /** How long the recorder holds the parked still, in ms. */
  readonly holdMs: number;
  /** The authored one-line caption shown on the beat's park frame. */
  readonly caption: string;
}

/** The authored beat map read from `<state-dir>/beats.json`. */
export interface BeatsMap {
  readonly scenario: string;
  readonly title: string;
  readonly beats: readonly Beat[];
}

/** Thrown by {@link openStateDir} when the target is not a Reactor state-dir. */
export class NotAStateDirError extends Error {
  constructor(public readonly stateDir: string) {
    super(`not a Reactor state-dir: ${stateDir}`);
    this.name = "NotAStateDirError";
  }
}

/**
 * Open a saved `<state-dir>` for replay. PURE READ (B5): the storage adapter is
 * opened `read_only`, so it NEVER `mkdir`s the target or seeds empty
 * `registry.json` / `receipts.json` — a non-existent or bare directory is left
 * byte-for-byte untouched, preserving the not-a-state-dir signal that
 * {@link isReactorStateDir} reads. An absent/bare path raises
 * {@link NotAStateDirError} (a clean signal) rather than being silently
 * created. Re-derives the ledger, shapes a {@link ReplaySession}, and loads the
 * saved topology if present. No model key, no running reactor (plan §1.3).
 */
export function openStateDir(
  stateDir: string,
  options: OpenStateDirOptions = {},
): OpenedStateDir {
  if (!isReactorStateDir(stateDir)) {
    throw new NotAStateDirError(stateDir);
  }
  const storage = createFileSystemStorageAdapter({
    directory: stateDir,
    read_only: true,
  });
  // The RAW persisted trail, ORIGINAL content_hashes intact — the authoritative
  // input to chain-verify (see OpenedStateDir.rawReceipts). A throw here (a
  // receipts file that is not a JSON array, etc.) is a TRUE error and propagates;
  // only a well-formed `[]` is the legitimate empty case.
  const rawReceipts = storage.listReceipts();
  const ledger = new FileSystemReceiptLedger({ storage });
  const session = createReplaySession(
    { ledger },
    options.cost ? { cost: options.cost } : {},
  );
  const topology = readTopology(stateDir);
  const worldModels = openWorldModels(stateDir);
  const labels = readLabels(stateDir);
  const beats = readBeats(stateDir);
  return { stateDir, session, rawReceipts, topology, worldModels, labels, beats };
}

/**
 * Chain-verify ONE node against the RAW on-disk receipts — NOT the re-stamped
 * ledger (see {@link OpenedStateDir.rawReceipts} for why). Groups the
 * as-persisted receipts by node in append order and runs the SDK's
 * {@link verifyReceiptChain}. Falls back to the SDK ledger's `verifyNodeChain`
 * only when the raw trail is unavailable (it never should be for a real
 * state-dir).
 */
export function verifyNodeChainRaw(
  opened: OpenedStateDir,
  node: string,
): ChainResult {
  if (opened.rawReceipts === null) {
    return opened.session.verifyNodeChain(node);
  }
  const slice = opened.rawReceipts.filter(
    (r) =>
      r !== null &&
      typeof r === "object" &&
      (r as Record<string, unknown>).node === node,
  );
  return verifyReceiptChain(slice);
}

/**
 * Read the optional `<state-dir>/beats.json` (an authored {@link BeatsMap}), or
 * `null` if absent or malformed. Pure read; beats are presentation data carried
 * by the state-dir so the SPA stays generic — a state-dir without `beats.json`
 * (e.g. the agent-observatory) renders exactly as before with computed captions.
 * Defensive: a non-object / wrong-shaped file is treated as "no beats".
 */
export function readBeats(stateDir: string): BeatsMap | null {
  const path = join(stateDir, "beats.json");
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (raw === null || typeof raw !== "object") return null;
    const obj = raw as Record<string, unknown>;
    if (!Array.isArray(obj.beats)) return null;
    const beats: Beat[] = [];
    for (const b of obj.beats as unknown[]) {
      if (b === null || typeof b !== "object") continue;
      const o = b as Record<string, unknown>;
      if (typeof o.park !== "number" || typeof o.caption !== "string") continue;
      beats.push({
        name: typeof o.name === "string" ? o.name : "",
        park: o.park,
        from: typeof o.from === "number" ? o.from : o.park,
        to: typeof o.to === "number" ? o.to : o.park,
        holdMs: typeof o.holdMs === "number" ? o.holdMs : 0,
        caption: o.caption,
      });
    }
    return {
      scenario: typeof obj.scenario === "string" ? obj.scenario : "",
      title: typeof obj.title === "string" ? obj.title : "",
      beats,
    };
  } catch {
    return null;
  }
}

/**
 * Read the optional `<state-dir>/compile/labels.json` (a flat
 * `nodeId → friendly label` map), or `{}` if absent or malformed. Pure read;
 * labels are presentation data carried by the state-dir so the SPA stays
 * generic. A non-object/non-string-valued file is treated as "no labels"
 * (defensive — never throw on a viewer-only nicety).
 */
export function readLabels(stateDir: string): Record<string, string> {
  const path = join(stateDir, "compile", "labels.json");
  if (!existsSync(path)) return {};
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (raw === null || typeof raw !== "object") return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === "string") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Read `<state-dir>/compile/topology.json`, or `null` if absent.
 *
 * Tolerates BOTH on-disk shapes:
 *   - FLAT — `{ nodes, edges, entry_points, acyclic }` (the `TopologyWorldModel`
 *     itself; the committed devtools fixtures are written this way).
 *   - NESTED ENVELOPE — `{ contract_fingerprints, topology: { nodes, edges,
 *     entry_points, acyclic } }`, which is exactly what `reactor compile`
 *     persists (the CLI wraps the serializable `ReconcilerTopology` alongside the
 *     contract fingerprints — see reactor-cli `run/connectors.ts MutableTopology`).
 * When a `{ topology: … }` envelope is present we unwrap one level; otherwise we
 * read the flat object. Before this guard the reader assumed the flat shape, so a
 * real CLI-produced state-dir crashed `buildSnapshot` with
 * `TypeError: Cannot read properties of undefined (reading 'map')` and the server
 * never bound. We keep the read defensive but DO NOT fabricate a topology: a file
 * that is neither shape (no readable `nodes` array) yields `null`, so the viewer
 * falls back to the node-only set rather than throwing on a malformed envelope.
 */
export function readTopology(stateDir: string): TopologyWorldModel | null {
  const path = join(stateDir, "compile", "topology.json");
  if (!existsSync(path)) return null;
  const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
  return unwrapTopology(raw);
}

/**
 * Normalize a parsed `topology.json` value to a `TopologyWorldModel`, unwrapping
 * the CLI's `{ topology: … }` envelope when present. Returns `null` for a
 * value that carries no readable `nodes` array in either position — the caller
 * treats that as "no saved topology" (node-only fallback), never a throw.
 */
export function unwrapTopology(raw: unknown): TopologyWorldModel | null {
  if (raw === null || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  // Nested envelope (`reactor compile`): unwrap one level when `.topology` holds
  // the world-model. Else read flat (the committed fixtures / a bare snapshot).
  const candidate =
    isTopologyWorldModel(obj.topology) ? obj.topology : obj;
  return isTopologyWorldModel(candidate)
    ? (candidate as unknown as TopologyWorldModel)
    : null;
}

/** Structural guard: a value carrying the `TopologyWorldModel` arrays. */
function isTopologyWorldModel(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  return Array.isArray(o.nodes) && Array.isArray(o.edges);
}

/**
 * Open the world-model store over `<state-dir>/world-models/` (the layout
 * `FileSystemWorldModelStore` reads back on a fresh instance), or `null` when
 * absent. Pure read handle; used only by `GET /api/node/:id`.
 */
export function openWorldModels(
  stateDir: string,
): WorldModelStore | null {
  const directory = join(stateDir, "world-models");
  if (!existsSync(directory)) return null;
  return createFileSystemWorldModelStore({ directory });
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
  /**
   * Friendly `nodeId → label` map read from the optional
   * `<state-dir>/compile/labels.json` (e.g. `"adapter-claude" → "Claude Adapter"`).
   * Empty when the state-dir has no `labels.json`. The SPA renders these instead
   * of the raw node id when present, so relatable names are DATA (per state-dir),
   * not hardcoded in the viewer — the viewer stays generic. The `--describe`
   * formatter uses the same map so its one-liners read the same as the video.
   */
  readonly labels: Record<string, string>;
  /**
   * The optional authored beat map from `<state-dir>/beats.json` (a director's
   * cut: scenario title + per-beat park-frame captions), or `null` when absent.
   * When present the SPA builds a `park-frame → caption` map from these beats and
   * PREFERS it over the computed observatory captions; when absent (e.g. the
   * agent-observatory) the SPA falls back to its computed captions, so that
   * scenario is byte-for-byte unchanged. Pure presentation data per state-dir.
   */
  readonly beats: BeatsMap | null;
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
    labels: opened.labels,
    beats: opened.beats,
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
    movedFacets: moved as ReadonlySet<Facet>,
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

// ---------------------------------------------------------------------------
// `--describe`: the headless, no-browser run summary (agent-ergonomics, plan §6).
//
// This is the text dump an AGENT reads instead of watching the video: per-node
// rendered/skipped/failed counts, the moved-facet diff per frame, the cost
// rollup, chain-verify status, and a one-line "what happened" per frame
// (`frame 34  Claude Adapter  rendered  moved[claude]  fresh 540  woke[…]`).
// It is a PURE FORMATTER over the same {@link buildSnapshot} the SPA renders, so
// the beats it prints are exactly the beats the video shows.
// ---------------------------------------------------------------------------

export interface DescribeOptions {
  /** Use friendly labels (default true when the snapshot carries them). */
  readonly useLabels?: boolean;
  /**
   * Whether this is a SHIPPED sample ledger (e.g. invoked via `--example`). When
   * true, `--describe` prints a one-line "synthetic sample ledger — token counts
   * are illustrative, not a bill" banner so a show-me reader does not misread the
   * round token figures as a real spend. Defaults to `false`.
   */
  readonly synthetic?: boolean;
}

/**
 * The result of {@link describeStateDir}: the rendered text plus the two signals
 * the CLI maps to an exit code. `chainOk === false` (a detected
 * tamper / broken chain) and a true read error are the only non-zero cases; an
 * empty-but-well-formed ledger is `empty: true, chainOk: true` and exits 0.
 */
export interface DescribeResult {
  /** The full `--describe` report text (already newline-terminated). */
  readonly text: string;
  /**
   * Whether every node chain verified against the RAW on-disk receipts. `false`
   * means a tamper/inconsistency the SDK caught — the CLI exits non-zero and the
   * report shows `CHAIN-VERIFY FAILED`. `true` on a clean OR empty ledger.
   */
  readonly chainOk: boolean;
  /**
   * Whether the ledger is the legitimate compile-only / first-run empty case
   * (zero receipts). The CLI prints the empty-state guidance and exits 0 — an
   * empty ledger is NOT an error. A true read error never reaches here:
   * {@link openStateDir} throws on a corrupt trail before describe runs.
   */
  readonly empty: boolean;
  /**
   * The SAME numbers the human `--describe` text shows, in a machine-readable
   * shape — what `reactor-devtools --describe --json` emits. A CI/agent
   * consumer parses THIS instead of scraping the text. Every field here is a
   * surfacing of a number {@link describeStateDir} already computed for the text
   * (the cost rollup is the SDK's `session.costRollup`; the chain-verify mirrors
   * the `CHAIN-VERIFY` line), so the two never drift.
   */
  readonly data: DescribeData;
}

/** One disposition tally (`rendered`/`skipped`/`failed` counts). */
export interface DispositionCounts {
  readonly rendered: number;
  readonly skipped: number;
  readonly failed: number;
}

/** One cost bucket in the JSON rollup — the SDK's bucket, surfaced verbatim. */
export interface DescribeCostBucket {
  readonly receipts: number;
  readonly fresh: number;
  readonly reused: number;
  readonly dollars: number;
}

/** A per-node line of the JSON `--describe --json` surface. */
export interface DescribeNode {
  readonly node: string;
  /** The friendly label used in the human text (falls back to the short name). */
  readonly label: string;
  readonly rendered: number;
  readonly skipped: number;
  readonly failed: number;
  /** Summed `cost.tokens.fresh` for the node. */
  readonly fresh: number;
  /** Per-node chain-verify (the `chain✓`/`chain✗` glyph, as a boolean). */
  readonly chainOk: boolean;
  /** True for a tampered node not present in the saved topology (off-topology). */
  readonly offTopology: boolean;
}

/** A per-frame line of the JSON `--describe --json` surface. */
export interface DescribeFrame {
  readonly index: number;
  readonly node: string;
  readonly label: string;
  readonly status: LedgerReceipt["status"];
  readonly wakeSource: LedgerReceipt["wake"]["source"];
  readonly movedFacets: readonly string[];
  readonly fresh: number;
  readonly reused: number;
  readonly surpriseCause: LedgerReceipt["cost"]["surprise_cause"];
  readonly wokenSubscribers: readonly string[];
}

/**
 * The machine-readable mirror of the human `--describe` report — emitted by
 * `reactor-devtools --describe --json`. It surfaces the SAME data the text
 * shows: the state-dir, a topology summary, the disposition + surprise-cause
 * totals, the cost rollup keyed by `surprise_cause` (`bySurpriseCause`, the noun
 * the README documents and the human line uses — fresh/reused token counts plus
 * the grand `total`), per-node + per-frame dispositions, and the chain-verify
 * verdict. A CI/agent consumer parses this; the numbers come straight from the
 * SDK's `costRollup` and the same chain-verify the text runs (no re-derivation).
 */
export interface DescribeData {
  /** Always present so a consumer can sniff the surface. */
  readonly tool: "reactor-devtools";
  readonly stateDir: string;
  /** True when the ledger is the legitimate compile-only / first-run empty case. */
  readonly empty: boolean;
  /** True when this is a shipped sample ledger (`--example`) — figures illustrative. */
  readonly synthetic: boolean;
  readonly topology: {
    /** True when topology came from a saved `topology.json` (not a node-only fallback). */
    readonly present: boolean;
    readonly nodes: number;
    readonly edges: number;
    readonly acyclic: boolean;
  };
  readonly receipts: number;
  /** Disposition totals across all frames. */
  readonly dispositions: DispositionCounts;
  /** Frame counts bucketed by `surprise_cause` (a.k.a. wake-cause). */
  readonly bySurpriseCause: Readonly<Record<string, number>>;
  /**
   * The cumulative cost rollup, the SDK's `session.costRollup` surfaced verbatim:
   * `bySurpriseCause` (per-cause buckets — fresh/reused tokens + receipts + $)
   * plus the grand `total`. This is the machine-readable cost surface a buyer/CI
   * parses (the devtools twin of `reactor receipts cost --json`).
   */
  readonly costRollup: {
    readonly bySurpriseCause: Readonly<Record<string, DescribeCostBucket>>;
    readonly total: DescribeCostBucket;
  };
  readonly nodes: readonly DescribeNode[];
  readonly frames: readonly DescribeFrame[];
  /**
   * The chain-verify verdict (the `CHAIN-VERIFY ok`/`FAILED` line as structured
   * data): `ok` mirrors {@link DescribeResult.chainOk}; `errors` lists the
   * per-node failures when a tamper is detected (empty on a clean/empty ledger).
   */
  readonly chainVerify: {
    readonly ok: boolean;
    readonly errors: readonly string[];
  };
}

/** Friendly label for a node, falling back to the structural short name. */
function labelFor(
  snapshot: ReplaySnapshot,
  node: string,
  useLabels: boolean,
): string {
  if (useLabels) {
    const l = snapshot.labels[node];
    if (l) return l;
  }
  const dot = node.indexOf(".");
  return dot >= 0 ? node.slice(dot + 1) : node;
}

/**
 * Render the full `--describe` report for an opened state-dir.
 * Pure over {@link buildSnapshot} + a per-node chain verify against the RAW
 * on-disk receipts; no I/O beyond what `opened` already holds, no browser.
 *
 * Returns a {@link DescribeResult} ({@link DescribeResult.text} + the exit-code
 * signals) rather than a bare string so the CLI can:
 *   - exit 0 on a clean OR legitimately-empty (compile-only / first-run) ledger,
 *   - exit non-zero on a detected tamper / broken chain (`chainOk === false`).
 * A TRUE error (corrupt/unreadable trail) never reaches here — `openStateDir`
 * throws first, which the CLI surfaces as a non-zero failure.
 */
export function describeStateDir(
  opened: OpenedStateDir,
  options: DescribeOptions = {},
): DescribeResult {
  const snapshot = buildSnapshot(opened);
  const useLabels =
    options.useLabels ?? Object.keys(snapshot.labels).length > 0;
  const lines: string[] = [];
  const W = (s: string, n: number): string =>
    s.length >= n ? s : s + " ".repeat(n - s.length);

  // ---- header ----
  lines.push(`reactor-devtools --describe`);
  // When describing a shipped sample ledger, flag the token figures as
  // illustrative so they are never misread as a real bill.
  if (options.synthetic) {
    lines.push(
      `  (synthetic sample ledger — token counts are illustrative, not a bill)`,
    );
  }
  lines.push(`  state-dir   ${opened.stateDir}`);
  lines.push(
    `  topology    ${snapshot.hasTopology ? "yes" : "no (node-only fallback)"} · ` +
      `${snapshot.nodes.length} nodes · ${snapshot.edges.length} edges · ` +
      `acyclic=${snapshot.acyclic}`,
  );
  lines.push(`  receipts    ${snapshot.frames.length} frames`);

  // The topology summary is shared by both the empty and the populated returns —
  // build it once so the JSON `data` mirrors the human header exactly.
  const topologySummary = {
    present: snapshot.hasTopology,
    nodes: snapshot.nodes.length,
    edges: snapshot.edges.length,
    acyclic: snapshot.acyclic,
  } as const;

  // ---- EMPTY LEDGER: the compile-only / first-run state is LEGITIMATE ----
  // A topology may be present (the dir was compiled) but no reactor has run yet,
  // so `receipts.json = []`. Before the guard, the per-frame/per-node walks below
  // were fine on `[]`, but the whole report read as a confusing "nothing here";
  // worse, the original code crashed on some empty shapes. Render a clear,
  // actionable empty state and exit 0 — empty is not an error.
  if (snapshot.frames.length === 0) {
    lines.push("");
    lines.push(`LEDGER EMPTY`);
    lines.push(
      `  No receipts yet — this state-dir is compiled-but-unrun (the most common`,
    );
    lines.push(
      `  first-run state). Run a reactor to populate the ledger, or replay a`,
    );
    lines.push(`  shipped fixture:`);
    lines.push("");
    lines.push(`    reactor run                 # populate <state-dir>/receipts.json`);
    lines.push(`    reactor-devtools <state-dir> --describe`);
    lines.push("");
    lines.push(
      `  Or replay the sample ledger that ships with this package (no path):`,
    );
    lines.push("");
    lines.push(
      `    reactor-devtools --example masked-relay --describe`,
    );
    lines.push("");
    // An empty chain is trivially consistent (verifyReceiptChain([]) → ok). This
    // is a clean exit-0 case, NOT a tamper.
    return {
      text: lines.join("\n") + "\n",
      chainOk: true,
      empty: true,
      data: {
        tool: "reactor-devtools",
        stateDir: opened.stateDir,
        empty: true,
        synthetic: options.synthetic ?? false,
        topology: topologySummary,
        receipts: 0,
        dispositions: { rendered: 0, skipped: 0, failed: 0 },
        bySurpriseCause: {},
        costRollup: {
          bySurpriseCause: {},
          total: { receipts: 0, fresh: 0, reused: 0, dollars: 0 },
        },
        nodes: [],
        frames: [],
        chainVerify: { ok: true, errors: [] },
      },
    };
  }

  // ---- disposition + wake totals ----
  const status = { rendered: 0, skipped: 0, failed: 0 } as Record<string, number>;
  const wake: Record<string, number> = {};
  for (const f of snapshot.frames) {
    status[f.status] = (status[f.status] ?? 0) + 1;
    wake[f.wakeSource] = (wake[f.wakeSource] ?? 0) + 1;
  }
  lines.push(
    `  dispositions rendered=${status.rendered} · skipped=${status.skipped} · failed=${status.failed}`,
  );
  // The human line uses `surprise-cause` to match the JSON surface
  // (`bySurpriseCause`), the README, and the post — all one noun. `wake-cause`
  // is footnoted as the synonym so a reader who knew the old label is not lost.
  lines.push(
    `  surprise-cause  ${Object.entries(wake)
      .map(([k, v]) => `${k}=${v}`)
      .join(" · ")}  (a.k.a. wake-cause)`,
  );

  // ---- cost rollup ----
  const t = snapshot.costRollup.total;
  const peak = snapshot.frames.reduce(
    (m, f) => (f.cost.fresh > m.fresh ? { fresh: f.cost.fresh, index: f.index } : m),
    { fresh: 0, index: -1 },
  );
  lines.push("");
  lines.push(`COST ROLLUP  (tokens)`);
  lines.push(
    `  total       fresh=${t.fresh} tokens · reused=${t.reused} tokens · ` +
      `reuse=${t.fresh + t.reused > 0 ? Math.round((t.reused / (t.fresh + t.reused)) * 100) : 0}%`,
  );
  for (const [cause, b] of Object.entries(snapshot.costRollup.byCause)) {
    if (b.receipts === 0) continue;
    lines.push(
      `    ${W(cause, 9)} receipts=${W(String(b.receipts), 3)} fresh=${W(String(b.fresh), 7)} tokens reused=${b.reused} tokens`,
    );
  }
  if (peak.index >= 0) {
    lines.push(
      `  peak fresh  ${peak.fresh} tokens at frame ${peak.index} ` +
        `(${labelFor(snapshot, snapshot.frames[peak.index]!.node, useLabels)})`,
    );
  }

  // ---- per-node counts ----
  lines.push("");
  lines.push(`PER-NODE`);
  const perNode = new Map<
    string,
    { rendered: number; skipped: number; failed: number; fresh: number }
  >();
  for (const f of snapshot.frames) {
    let r = perNode.get(f.node);
    if (!r) perNode.set(f.node, (r = { rendered: 0, skipped: 0, failed: 0, fresh: 0 }));
    r[f.status] += 1;
    r.fresh += f.cost.fresh;
  }
  // order by topology node order when available, else first-seen
  const order = snapshot.hasTopology
    ? snapshot.nodes.map((n) => n.id)
    : [...perNode.keys()];
  // Chain-verify against the RAW on-disk receipts (see OpenedStateDir.rawReceipts),
  // NOT the re-stamped session ledger which heals tampers.
  const chainErrors: string[] = [];
  // The structured per-node rows for the JSON surface — filled in the SAME
  // walk that prints the human PER-NODE block, so they never drift.
  const nodeData: DescribeNode[] = [];
  for (const id of order) {
    const r = perNode.get(id);
    if (!r) continue;
    const chain = verifyNodeChainRaw(opened, id);
    const chainTag = chain.ok ? "chain✓" : "chain✗";
    if (!chain.ok) {
      chainErrors.push(
        `  ${labelFor(snapshot, id, useLabels)}: ${chain.errors.join("; ")}`,
      );
    }
    nodeData.push({
      node: id,
      label: labelFor(snapshot, id, useLabels),
      rendered: r.rendered,
      skipped: r.skipped,
      failed: r.failed,
      fresh: r.fresh,
      chainOk: chain.ok,
      offTopology: false,
    });
    lines.push(
      `  ${W(labelFor(snapshot, id, useLabels), 26)} ` +
        `r=${W(String(r.rendered), 2)} s=${W(String(r.skipped), 2)} f=${W(String(r.failed), 2)} ` +
        `fresh=${W(String(r.fresh), 7)} tokens ${chainTag}`,
    );
  }
  // AUTHORITATIVE pass: verify EVERY node actually present in the RAW trail, not
  // just those in `order` (the topology / per-frame node set). A tamper that
  // edits a `node` field invents a phantom node that is NOT in the topology — its
  // broken singleton chain must still be caught, so we never miss a tamper just
  // because the tampered node isn't a drawn graph node.
  const verified = new Set(order);
  const rawNodes = new Set<string>();
  for (const raw of opened.rawReceipts ?? []) {
    if (raw !== null && typeof raw === "object") {
      const n = (raw as Record<string, unknown>).node;
      if (typeof n === "string") rawNodes.add(n);
    }
  }
  for (const id of rawNodes) {
    if (verified.has(id)) continue;
    const chain = verifyNodeChainRaw(opened, id);
    if (!chain.ok) {
      chainErrors.push(
        `  ${labelFor(snapshot, id, useLabels)} (off-topology): ${chain.errors.join("; ")}`,
      );
      // The off-topology node must ALSO show a per-node line with a flipped
      // `chain✗` glyph, so the PER-NODE view agrees with the global
      // `CHAIN-VERIFY FAILED` verdict (a tampered `node` field invents a phantom
      // node that would otherwise only surface in the global error list). Count
      // its raw receipts so the row's r/s/f/fresh reflect the as-persisted trail.
      const tally = { rendered: 0, skipped: 0, failed: 0, fresh: 0 };
      for (const raw of opened.rawReceipts ?? []) {
        if (raw === null || typeof raw !== "object") continue;
        const o = raw as Record<string, unknown>;
        if (o.node !== id) continue;
        const st = typeof o.status === "string" ? o.status : "";
        if (st === "rendered" || st === "skipped" || st === "failed") tally[st] += 1;
        const cost = o.cost as { tokens?: { fresh?: unknown } } | undefined;
        const fresh = cost?.tokens?.fresh;
        if (typeof fresh === "number") tally.fresh += fresh;
      }
      lines.push(
        `  ${W(labelFor(snapshot, id, useLabels) + " (off-topology)", 26)} ` +
          `r=${W(String(tally.rendered), 2)} s=${W(String(tally.skipped), 2)} f=${W(String(tally.failed), 2)} ` +
          `fresh=${W(String(tally.fresh), 7)} tokens chain✗`,
      );
      nodeData.push({
        node: id,
        label: labelFor(snapshot, id, useLabels),
        rendered: tally.rendered,
        skipped: tally.skipped,
        failed: tally.failed,
        fresh: tally.fresh,
        chainOk: false,
        offTopology: true,
      });
    }
  }
  const chainOk = chainErrors.length === 0;
  lines.push("");
  if (chainOk) {
    lines.push(
      `CHAIN-VERIFY  ok — meaning-layer chain-consistency`,
    );
    lines.push(
      `  (each receipt's content_hash matches its canonical payload and links its`,
    );
    lines.push(
      `   prev — NOT a cryptographic signature. v1 has a null signer, so this is`,
    );
    lines.push(
      `   tamper-EVIDENT against accidental / independent edits, NOT against a forge`,
    );
    lines.push(
      `   that re-stamps the trail with the public content-hash. Meaning-layer`,
    );
    lines.push(
      `   tamper-evidence, not byte-level non-repudiation.)`,
    );
  } else {
    lines.push(
      `CHAIN-VERIFY  FAILED — one or more node chains are tampered or inconsistent`,
    );
    for (const e of chainErrors) lines.push(e);
  }

  // ---- per-frame "what happened" ----
  lines.push("");
  lines.push(
    `FRAMES  (frame  node  status  moved[output facets that changed]  fresh tokens  woke[…])`,
  );
  // The structured per-frame rows for the JSON surface — filled in the SAME walk.
  const frameData: DescribeFrame[] = [];
  for (const f of snapshot.frames) {
    const moved = f.movedFacets.length ? f.movedFacets.join(",") : "—";
    const woke = f.wokenSubscribers.length
      ? f.wokenSubscribers
          .map((s) => labelFor(snapshot, s, useLabels))
          .join(",")
      : "—";
    lines.push(
      `  ${W(String(f.index), 3)} ` +
        `${W(labelFor(snapshot, f.node, useLabels), 26)} ` +
        `${W(f.status, 8)} ` +
        `moved[${W(moved, 22)}] ` +
        `fresh ${W(String(f.cost.fresh), 6)} tokens ` +
        `woke[${woke}]`,
    );
    frameData.push({
      index: f.index,
      node: f.node,
      label: labelFor(snapshot, f.node, useLabels),
      status: f.status,
      wakeSource: f.wakeSource,
      movedFacets: f.movedFacets,
      fresh: f.cost.fresh,
      reused: f.cost.reused,
      surpriseCause: f.cost.surpriseCause,
      wokenSubscribers: f.wokenSubscribers.map((s) =>
        labelFor(snapshot, s, useLabels),
      ),
    });
  }

  // The cost rollup for JSON: the SDK's per-cause buckets surfaced under the
  // documented `bySurpriseCause` noun (the same numbers `snapshot.costRollup`
  // carries — `byCause` keyed by `surprise_cause`), plus the grand total.
  const costBySurpriseCause: Record<string, DescribeCostBucket> = {};
  for (const [cause, b] of Object.entries(snapshot.costRollup.byCause)) {
    costBySurpriseCause[cause] = {
      receipts: b.receipts,
      fresh: b.fresh,
      reused: b.reused,
      dollars: b.dollars,
    };
  }

  return {
    text: lines.join("\n") + "\n",
    chainOk,
    empty: false,
    data: {
      tool: "reactor-devtools",
      stateDir: opened.stateDir,
      empty: false,
      synthetic: options.synthetic ?? false,
      topology: topologySummary,
      receipts: snapshot.frames.length,
      dispositions: {
        rendered: status.rendered ?? 0,
        skipped: status.skipped ?? 0,
        failed: status.failed ?? 0,
      },
      bySurpriseCause: { ...wake },
      costRollup: {
        bySurpriseCause: costBySurpriseCause,
        total: {
          receipts: snapshot.costRollup.total.receipts,
          fresh: snapshot.costRollup.total.fresh,
          reused: snapshot.costRollup.total.reused,
          dollars: snapshot.costRollup.total.dollars,
        },
      },
      nodes: nodeData,
      frames: frameData,
      chainVerify: {
        ok: chainOk,
        errors: chainErrors.map((e) => e.trim()),
      },
    },
  };
}

// Re-exported so S4 (inspector / chain-verified badge) can build on the same
// data layer without re-importing the SDK directly. `verifyReceipt` is the
// per-receipt content_hash check the chain verifier is built on.
export { verifyReceipt, verifyReceiptChain };
export type { ReplaySession, LedgerReceipt, TopologyWorldModel };
