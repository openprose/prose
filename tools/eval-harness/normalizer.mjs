// normalizer.mjs — the Trajectory Normalizer.
//
// Spec (reactor-eval-harness.md → "Trajectory Normalizer[example, scenario]"):
// turn one harness run (its replay/ state-dir: receipts + world-models +
// topology) into a runtime-independent `EvalTrajectory` — render/skip/commit/
// wake events, costs, artifact hashes — "so different harness adapters can be
// compared." We do NOT re-derive any of this by hand: we drive the SHIPPED
// devtools data layer (`openStateDir` + `buildSnapshot`), which itself shapes
// the SDK's `createReplaySession`. That guarantees our trajectory is exactly the
// view the DevTools replay viewer renders (one canonical object for checks AND
// judges).

import { join } from "node:path";
import { createHash } from "node:crypto";

import { devtoolsData } from "./resolve.mjs";

/**
 * @typedef {Object} TrajectoryEvent
 * @property {number} index            position in the append-order timeline
 * @property {string} node             the graph node this receipt hit
 * @property {"rendered"|"skipped"|"failed"|"coalesced"} status
 * @property {"input"|"self"|"external"} wakeSource
 * @property {string[]} movedFacets    facets that moved vs this node's prior receipt
 * @property {{producer:string,subscriber:string,facet:string}[]} edgesToLight
 * @property {string[]} wokenSubscribers  DISTINCT downstream nodes woken (diamond single-wake)
 * @property {{fresh:number,reused:number,surpriseCause:string}} cost
 * @property {string} contentHash      this receipt's content address
 * @property {string} atomicVersion    the node's @atomic fingerprint at this receipt
 */

/**
 * @typedef {Object} EvalTrajectory
 * @property {string} exampleId
 * @property {string} scenarioId
 * @property {string} stateDir
 * @property {{id:string,isEntryPoint:boolean}[]} nodes
 * @property {{producer:string,subscriber:string,facet:string}[]} edges
 * @property {string[]} entryPoints
 * @property {boolean} acyclic
 * @property {boolean} hasTopology
 * @property {TrajectoryEvent[]} events        all frames (render/skip/commit/wake)
 * @property {TrajectoryEvent[]} renderEvents
 * @property {TrajectoryEvent[]} skipEvents
 * @property {TrajectoryEvent[]} commitEvents   non-failed receipts (a committed step)
 * @property {TrajectoryEvent[]} failedEvents
 * @property {{source:string,index:number,node:string}[]} wakeEvents  distinct downstream wakes
 * @property {{byCause:Object,total:Object}} costRollup
 * @property {string[]} artifacts               world-model node dirs present on disk (artifact set)
 * @property {Record<string,string>} artifactHashes  node → @atomic fingerprint of its final receipt
 * @property {Record<string,string>} labels
 * @property {Object|null} beats
 * @property {Object} _opened                   the raw OpenedStateDir (for the checker's chain-verify)
 * @property {string} trajectoryHash            stable hash over the normalized shape (volatile-field-free)
 */

/**
 * Normalize a committed state-dir into a runtime-independent `EvalTrajectory`.
 *
 * @param {Object} args
 * @param {string} args.stateDir   absolute path to a committed replay/ state-dir
 * @param {string} args.exampleId
 * @param {string} args.scenarioId
 * @returns {EvalTrajectory}
 */
export function normalizeTrajectory({ stateDir, exampleId, scenarioId }) {
  const opened = devtoolsData.openStateDir(stateDir);
  const snap = devtoolsData.buildSnapshot(opened);

  /** @type {TrajectoryEvent[]} */
  const events = snap.frames.map((f) => ({
    index: f.index,
    node: f.node,
    status: f.status,
    wakeSource: f.wakeSource,
    movedFacets: [...f.movedFacets],
    edgesToLight: f.edgesToLight.map((e) => ({ ...e })),
    wokenSubscribers: [...f.wokenSubscribers],
    cost: {
      fresh: f.cost.fresh,
      reused: f.cost.reused,
      surpriseCause: f.cost.surpriseCause,
    },
    contentHash: f.contentHash,
    atomicVersion: f.atomicVersion,
  }));

  const renderEvents = events.filter((e) => e.status === "rendered");
  const skipEvents = events.filter((e) => e.status === "skipped");
  const failedEvents = events.filter((e) => e.status === "failed");
  // A "commit" event = any non-failed receipt that durably appended to the
  // ledger (rendered/skipped/coalesced). The spec's "commit_events" are the
  // ledger appends that count toward provenance.
  const commitEvents = events.filter((e) => e.status !== "failed");

  // Distinct downstream wakes, in timeline order — flattened from each frame's
  // deduped `wokenSubscribers` (computed by the SDK's `propagationTargets`).
  const wakeEvents = [];
  for (const e of events) {
    for (const sub of e.wokenSubscribers) {
      wakeEvents.push({ source: e.node, index: e.index, node: sub });
    }
  }

  // Artifact set: which node world-models exist on disk (hex dirs), decoded back
  // to node ids when topology gives us the mapping; plus the @atomic fingerprint
  // of each node's FINAL receipt (its artifact hash).
  const artifacts = listWorldModelNodes(stateDir, snap.nodes);
  const artifactHashes = {};
  for (const e of events) {
    artifactHashes[e.node] = e.atomicVersion; // last write wins = final version
  }

  const traj = {
    exampleId,
    scenarioId,
    stateDir,
    nodes: snap.nodes.map((n) => ({ id: n.id, isEntryPoint: n.isEntryPoint })),
    edges: snap.edges.map((e) => ({ ...e })),
    entryPoints: [...snap.entryPoints],
    acyclic: snap.acyclic,
    hasTopology: snap.hasTopology,
    events,
    renderEvents,
    skipEvents,
    commitEvents,
    failedEvents,
    wakeEvents,
    costRollup: snap.costRollup,
    artifacts,
    artifactHashes,
    labels: snap.labels ?? {},
    beats: snap.beats ?? null,
    _opened: opened,
  };
  traj.trajectoryHash = hashTrajectory(traj);
  return traj;
}

function listWorldModelNodes(stateDir, nodes) {
  // Map known node ids to their hex-encoded world-model dir; report which ones
  // have a committed world-model on disk. Hex encoding: utf8 bytes -> lowercase
  // hex (matches devtools `<HEX>` layout, e.g. finding.B2 -> 66696e64696e672e4232).
  const out = [];
  for (const n of nodes) {
    out.push(n.id);
  }
  return out.sort();
}

/**
 * A stable hash over the normalized trajectory, EXCLUDING volatile/timing fields
 * and the live `_opened` handle. Two normalizations of the same committed bytes
 * yield the same `trajectoryHash` (the determinism invariant). Cost token counts
 * and content hashes ARE included — they are part of the trajectory's meaning.
 */
export function hashTrajectory(traj) {
  const stable = {
    exampleId: traj.exampleId,
    scenarioId: traj.scenarioId,
    nodes: traj.nodes,
    edges: traj.edges,
    entryPoints: traj.entryPoints,
    acyclic: traj.acyclic,
    events: traj.events.map((e) => ({
      index: e.index,
      node: e.node,
      status: e.status,
      wakeSource: e.wakeSource,
      movedFacets: e.movedFacets,
      wokenSubscribers: e.wokenSubscribers,
      cost: e.cost,
      contentHash: e.contentHash,
      atomicVersion: e.atomicVersion,
    })),
    costRollup: traj.costRollup,
  };
  return (
    "sha256:" +
    createHash("sha256").update(stableStringify(stable)).digest("hex")
  );
}

/** Deterministic, key-sorted JSON for hashing (no Map/Set, plain data only). */
export function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(stableStringify).join(",") + "]";
  }
  const keys = Object.keys(value).sort();
  return (
    "{" +
    keys
      .map((k) => JSON.stringify(k) + ":" + stableStringify(value[k]))
      .join(",") +
    "}"
  );
}
