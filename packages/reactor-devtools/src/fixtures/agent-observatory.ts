// The Agent State Observatory fixture GENERATOR — produces a deterministic,
// replayable `<state-dir>` that drives the launch demo (and doubles as the
// devtools test corpus). It is a sibling of `masked-relay.ts` and reuses ONLY
// the public, exported SDK primitives; no SDK change is required.
//
// THE STORY (what the recording must land):
//   Your laptop is a sprawling multi-runtime agent state machine — Claude Code,
//   Codex, OpenCode, Pi, Hermes, OpenClaw. One "Runtime Watch" gateway watches a
//   normalized agent-fs and exposes ONE FACET PER RUNTIME. Six runtime adapters
//   each subscribe to ONLY their own runtime facet. A change to a single Claude
//   session moves ONLY the `claude` facet ⇒ ONLY the Claude Adapter lane lights;
//   the five sibling adapter lanes stay DARK (the facet "dark lane"). The Claude
//   Adapter feeds a Session Ledger that exposes a `session:<id>` facet per active
//   session; each per-session Summary subscribes to exactly one ⇒ a SECOND dark
//   lane. The summaries fan into a Workstream Index (a DIAMOND — woken exactly
//   ONCE even when two summaries move). A Workstream Index gating facet
//   ("reclustering needed") drives the expensive, batched Concept Clusterer,
//   which stays DARK on small deltas and only wakes — the single tall fresh
//   spike — on a "major new project" delta. A terminal Agent Dashboard renders
//   the rollup.
//
// THE MECHANICAL FIX vs masked-relay (MVC §R2): the gateway canonicalizer emits
// INDEPENDENT per-runtime facet tokens. A Claude file change perturbs the
// `claude` token and NOTHING else; the `codex`/`opencode`/… tokens are
// byte-identical, so their adapter lanes never wake. masked-relay's masker moved
// all view facets together — that is exactly the bug this fixture must not have.
//
// It persists the SAME full state-dir shape masked-relay does, PLUS a friendly
// labels map for the SPA:
//
//   <state-dir>/receipts.json              (durable append-only ledger trail)
//   <state-dir>/world-models/<node>/…      (per-node published truth + history)
//   <state-dir>/compile/topology.json      (the flat TopologyWorldModel the SPA draws)
//   <state-dir>/compile/labels.json        (nodeId → friendly label for the SPA)
//
// Determinism: every render body is a PURE function of (upstream truth read by
// reference, own prior); cost is a pure function of how much actually moved.
// Same generator ⇒ byte-identical state-dir ⇒ the devtools replays the same
// animation every time.

import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";

import {
  mountDag,
  fileSystemSubstrate,
  files,
  jsonFile,
  ATOMIC_FACET,
  type Cost,
  type WakeSource,
  externalWake,
  type RenderContext,
  type RenderProduct,
} from "@openprose/reactor";

import {
  readTextFile,
  fingerprintArtifact,
  type WorldModelStore,
  type WorldModelFiles,
} from "@openprose/reactor/adapters";

import {
  zeroCost,
  createNullSignature,
  EMPTY_SEMANTIC_DIFF,
  type Fingerprint,
  type Facet,
  type TopologyWorldModel,
  type TopologyNode,
  type TopologyEdge,
  type ReconcilerTopology, asFacet, asFingerprint, asNodeId} from "@openprose/reactor/internals";

import { materialFingerprint, readJson } from "./_fixture-shared";

// ---------------------------------------------------------------------------
// Node identities (relatable names — the labels the SPA shows come from the
// labels map below; the ids stay namespaced for the topology).
// ---------------------------------------------------------------------------

const SOURCE = "ingress.agent-fs"; // the phantom edge: the normalized agent filesystem
const GATEWAY = "gateway.runtime-watch"; // entry point; ONE facet per runtime

// The six runtimes — the row of watchers that is mostly DARK in the hero beat.
const RUNTIMES = ["claude", "codex", "opencode", "pi", "hermes", "openclaw"] as const;
type Runtime = (typeof RUNTIMES)[number];

const ADAPTER: Record<Runtime, string> = {
  claude: "responsibility.adapter-claude",
  codex: "responsibility.adapter-codex",
  opencode: "responsibility.adapter-opencode",
  pi: "responsibility.adapter-pi",
  hermes: "responsibility.adapter-hermes",
  openclaw: "responsibility.adapter-openclaw",
};

const SESSION_LEDGER = "responsibility.session-ledger";

// Three active sessions across two runtimes (two Claude, one Codex) — the
// per-session fan-out + the second dark lane.
const SESSIONS = ["claudeA", "claudeB", "codexA"] as const;
type SessionId = (typeof SESSIONS)[number];

const SESSION_RUNTIME: Record<SessionId, Runtime> = {
  claudeA: "claude",
  claudeB: "claude",
  codexA: "codex",
};

const SUMMARY: Record<SessionId, string> = {
  claudeA: "responsibility.summary-claudeA",
  claudeB: "responsibility.summary-claudeB",
  codexA: "responsibility.summary-codexA",
};

const WORKSTREAM_INDEX = "responsibility.workstream-index";
const CONCEPT_CLUSTERER = "responsibility.concept-clusterer";
const DASHBOARD = "responsibility.dashboard";

// --- Facet tokens -----------------------------------------------------------

// One facet per runtime on the gateway — the dark-lane boundary.
const RUNTIME_FACET: Record<Runtime, Facet> = {
  claude: asFacet("claude"),
  codex: asFacet("codex"),
  opencode: asFacet("opencode"),
  pi: asFacet("pi"),
  hermes: asFacet("hermes"),
  openclaw: asFacet("openclaw"),
};

// One facet per session on the session ledger — the second dark lane.
const SESSION_FACET: Record<SessionId, Facet> = {
  claudeA: asFacet("session:claudeA"),
  claudeB: asFacet("session:claudeB"),
  codexA: asFacet("session:codexA"),
};

// The gating facet the Workstream Index exposes to the expensive Clusterer: it
// moves ONLY when the set of distinct workstreams changes (a "major new
// project"), not on every session edit. That is why the Clusterer stays dark on
// small deltas and only spikes once.
const CLUSTER_GATE_FACET = asFacet("cluster-gate");
// The cheap incremental facet the Dashboard reads — moves on every rollup.
const ROLLUP_FACET = asFacet("rollup");

// ---------------------------------------------------------------------------
// Friendly labels for the SPA (nodeId → human label). Load-bearing for the
// Twitter read: boxes say "Claude Adapter", not `adapter-claude`.
// ---------------------------------------------------------------------------

const LABELS: Record<string, string> = {
  [SOURCE]: "Agent FS",
  [GATEWAY]: "Runtime Watch",
  [ADAPTER.claude]: "Claude Adapter",
  [ADAPTER.codex]: "Codex Adapter",
  [ADAPTER.opencode]: "OpenCode Adapter",
  [ADAPTER.pi]: "Pi Adapter",
  [ADAPTER.hermes]: "Hermes Adapter",
  [ADAPTER.openclaw]: "OpenClaw Adapter",
  [SESSION_LEDGER]: "Session Ledger",
  [SUMMARY.claudeA]: "Session Summary [claudeA]",
  [SUMMARY.claudeB]: "Session Summary [claudeB]",
  [SUMMARY.codexA]: "Session Summary [codexA]",
  [WORKSTREAM_INDEX]: "Workstream Index",
  [CONCEPT_CLUSTERER]: "Concept Clusterer",
  [DASHBOARD]: "Agent Dashboard",
};

// ---------------------------------------------------------------------------
// The cost model — what makes the token meter SING (the cost-meter hero shot)
// ---------------------------------------------------------------------------
//
// Fresh tokens scale with how much NEW material a render had to digest/produce;
// the parts it could reuse count as REUSED. The reconciler stamps `skipped`
// receipts with zeroCost automatically (fresh:0 — a flat line). The Clusterer's
// fresh is deliberately heavy so beat 8 is a single tall spike off a flat line.
//
// `surprise_cause` MUST equal the wake source (receipt validation enforces it).

const FRESH_PER_UNIT = 180; // fresh tokens per unit of new material digested
const REUSED_FLOOR = 240; // reused tokens always carried (prior frame + contract)
const CLUSTERER_FRESH_MULTIPLIER = 9; // the expensive node burns ~9× per unit

function renderCost(
  ctx: RenderContext,
  freshUnits: number,
  reusedUnits = 0,
  freshPerUnit = FRESH_PER_UNIT,
): Cost {
  return {
    provider: "fixture",
    model: "deterministic-fake",
    tokens: {
      fresh: Math.max(1, Math.round(freshUnits * freshPerUnit)),
      reused: REUSED_FLOOR + reusedUnits * 40,
    },
    surprise_cause: ctx.wake.source,
  };
}

// ---------------------------------------------------------------------------
// The agent-fs payload: a flat map of per-runtime session state. A "delta"
// mutates exactly one runtime's slice (so exactly one runtime facet moves).
// ---------------------------------------------------------------------------

interface SessionState {
  readonly id: SessionId;
  readonly runtime: Runtime;
  /** Monotonic edit counter — bumping it is a session change. */
  readonly rev: number;
  /** The newest turn text (what an adapter normalizes). */
  readonly head: string;
  /** A workstream tag — when a NEW tag appears, the cluster gate moves. */
  readonly workstream: string;
  /** When true, the session JSONL is corrupt — the adapter throws on parse. */
  readonly corrupt?: boolean;
}

// The mutable agent-fs the generator drives. Keyed by runtime → its sessions.
type AgentFs = Record<Runtime, SessionState[]>;

function seedFs(): AgentFs {
  // Cold boot starts with a SINGLE shared workstream ("bootstrap"). That keeps the
  // cold-boot Concept Clusterer render SMALL (it clusters one workstream's concept
  // space) — so the cold-boot cascade does NOT plant a tall fresh spike that rivals
  // the batch beat. The batch beat (§3 #8) then re-assigns the sessions to DISTINCT
  // new workstreams, expanding the distinct-workstream set sharply ⇒ the clusterer
  // wakes ONCE and burns the single tall fresh spike off an otherwise-flat line.
  // This is the generator-side half of the "flat line → single tick" pitch fix.
  return {
    claude: [
      { id: "claudeA", runtime: "claude", rev: 1, head: "scaffold reactor devtools", workstream: "bootstrap" },
      { id: "claudeB", runtime: "claude", rev: 1, head: "draft launch plan", workstream: "bootstrap" },
    ],
    codex: [{ id: "codexA", runtime: "codex", rev: 1, head: "port cli tests", workstream: "bootstrap" }],
    // The other four runtimes are present but quiet — their adapters render once
    // at cold boot and then stay DARK for the whole episode (the "row of
    // watchers mostly dark" backdrop). They have no tracked sessions.
    opencode: [],
    pi: [],
    hermes: [],
    openclaw: [],
  };
}

function readTruth(fm: WorldModelFiles): Record<string, unknown> {
  const bytes = fm["truth.json"];
  return bytes === undefined
    ? {}
    : (JSON.parse(readTextFile(bytes)) as Record<string, unknown>);
}

function commit(world: unknown, cost: Cost): RenderProduct {
  return {
    world_model: files({ "truth.json": jsonFile(world) }),
    cost,
  };
}

// ---------------------------------------------------------------------------
// Canonicalizers (which facets a node's truth exposes)
// ---------------------------------------------------------------------------

const atomicTruth = (fm: WorldModelFiles) => ({
  [ATOMIC_FACET]: asFingerprint(fingerprintArtifact(fm)),
});

// The ingress source exposes one facet per runtime — the fingerprint of ONLY
// that runtime's slice. This is the root of the dark lane: mutate claude's
// slice and only the `claude` ingress facet moves.
const ingressCanon = (fm: WorldModelFiles) => {
  const bytes = fm["agent-fs.json"];
  const fs: Partial<AgentFs> =
    bytes === undefined ? {} : (JSON.parse(readTextFile(bytes)) as AgentFs);
  const out: Record<string, Fingerprint> = { [ATOMIC_FACET]: asFingerprint(fingerprintArtifact(fm)) };
  for (const rt of RUNTIMES) {
    out[RUNTIME_FACET[rt]] = materialFingerprint(fs[rt] ?? []);
  }
  return out;
};

// THE dark-lane boundary. The gateway re-projects each runtime slice into an
// INDEPENDENT facet token. A Claude-only change moves ONLY `claude`; the five
// sibling tokens are byte-identical to the prior frame, so the five sibling
// adapter lanes stay dark.
const gatewayCanon = (fm: WorldModelFiles) => {
  const t = readTruth(fm);
  const runtimes = (t["runtimes"] ?? {}) as Record<string, unknown>;
  const out: Record<string, Fingerprint> = { [ATOMIC_FACET]: asFingerprint(fingerprintArtifact(fm)) };
  for (const rt of RUNTIMES) {
    out[RUNTIME_FACET[rt]] = materialFingerprint(runtimes[rt] ?? []);
  }
  return out;
};

// The session ledger exposes one facet per active session, plus a cheap rollup
// facet. A change to session claudeA moves ONLY `session:claudeA` (the second
// dark lane). Inactive sessions are absent ⇒ their facet token is the empty fp.
const sessionLedgerCanon = (fm: WorldModelFiles) => {
  const t = readTruth(fm);
  const sessions = (t["sessions"] ?? {}) as Record<string, unknown>;
  const out: Record<string, Fingerprint> = { [ATOMIC_FACET]: asFingerprint(fingerprintArtifact(fm)) };
  for (const sid of SESSIONS) {
    out[SESSION_FACET[sid]] = materialFingerprint(sessions[sid] ?? null);
  }
  return out;
};

// The Workstream Index exposes TWO facets:
//   - `rollup`: the cheap incremental rollup the Dashboard reads (moves on
//     every workstream-index render).
//   - `cluster-gate`: the GATING facet the expensive Clusterer reads. It is the
//     fingerprint of ONLY the DISTINCT WORKSTREAM SET — so it moves iff a brand
//     new workstream appears (a "major new project"), NOT on every session edit.
//     That is why the Clusterer stays dark on small deltas.
const workstreamIndexCanon = (fm: WorldModelFiles) => {
  const t = readTruth(fm);
  return {
    [ATOMIC_FACET]: asFingerprint(fingerprintArtifact(fm)),
    [ROLLUP_FACET]: asFingerprint(materialFingerprint(t["rollup"] ?? null)),
    [CLUSTER_GATE_FACET]: asFingerprint(materialFingerprint(t["workstreams"] ?? [])),
  };
};

// ---------------------------------------------------------------------------
// Render bodies (pure deterministic fakes; cost scales with material moved)
// ---------------------------------------------------------------------------

interface Deps {
  readonly store: WorldModelStore;
}

type Render = (ctx: RenderContext) => RenderProduct;

// The gateway: read the raw agent-fs, normalize into a per-runtime view. The
// per-runtime structure is what the canonicalizer projects into independent
// facet tokens.
function gatewayRender(deps: Deps): Render {
  return (ctx) => {
    const fs = (readJson<Partial<AgentFs>>(deps.store, SOURCE, "agent-fs.json") ?? {}) as Partial<AgentFs>;
    const runtimes: Record<string, unknown> = {};
    let moved = 0;
    for (const rt of RUNTIMES) {
      const sessions = (fs[rt] ?? []).map((s) => ({
        id: s.id,
        rev: s.rev,
        head: s.head,
        workstream: s.workstream,
        corrupt: s.corrupt ?? false,
      }));
      runtimes[rt] = sessions;
      moved += sessions.length;
    }
    return commit({ runtimes, watched: RUNTIMES.length }, renderCost(ctx, Math.max(1, moved), 1));
  };
}

// A runtime adapter: read ONLY its own runtime slice off the gateway and
// normalize each session into a ledger-ready record. The Codex adapter THROWS
// when a session is flagged corrupt (the fail beat) — a `failed` receipt, no
// downstream propagation, prior truth stands.
function adapterRender(deps: Deps, runtime: Runtime): Render {
  return (ctx) => {
    const gw = readJson(deps.store, GATEWAY);
    const runtimes = (gw?.["runtimes"] ?? {}) as Record<string, SessionState[]>;
    const mine = runtimes[runtime] ?? [];
    const normalized = mine.map((s) => {
      if (s.corrupt) {
        // A malformed/truncated session JSONL — the adapter cannot parse it.
        throw new Error(`${runtime} adapter: truncated session JSONL for "${s.id}" (rev ${s.rev})`);
      }
      return {
        session: s.id,
        runtime,
        rev: s.rev,
        normalized_head: `[${runtime}] ${s.head}`,
        workstream: s.workstream,
      };
    });
    return commit(
      { runtime, sessions: normalized, count: normalized.length },
      renderCost(ctx, Math.max(1, normalized.length), 1),
    );
  };
}

// The session ledger: merge every adapter's normalized sessions into one
// per-session map. The canonicalizer then exposes one facet per session.
function sessionLedgerRender(deps: Deps): Render {
  return (ctx) => {
    const sessions: Record<string, unknown> = {};
    let moved = 0;
    for (const rt of RUNTIMES) {
      const a = readJson(deps.store, ADAPTER[rt]);
      for (const s of (a?.["sessions"] ?? []) as Record<string, unknown>[]) {
        sessions[s["session"] as string] = {
          id: s["session"],
          runtime: s["runtime"],
          rev: s["rev"],
          head: s["normalized_head"],
          workstream: s["workstream"],
        };
        moved += 1;
      }
    }
    return commit(
      { sessions, active: Object.keys(sessions).sort() },
      renderCost(ctx, Math.max(1, moved), 1),
    );
  };
}

// A per-session summary: read ONLY its own session off the ledger and produce a
// one-line summary. Subscribes to exactly one `session:<id>` facet, so a change
// to a sibling session leaves it dark.
function summaryRender(deps: Deps, sid: SessionId): Render {
  return (ctx) => {
    const ledger = readJson(deps.store, SESSION_LEDGER);
    const sessions = (ledger?.["sessions"] ?? {}) as Record<string, Record<string, unknown>>;
    const me = sessions[sid] ?? null;
    return commit(
      {
        session: sid,
        runtime: SESSION_RUNTIME[sid],
        rev: me?.["rev"] ?? 0,
        summary: me ? `summary of ${me["head"]}` : "(no session)",
        workstream: me?.["workstream"] ?? null,
      },
      renderCost(ctx, 1, 1),
    );
  };
}

// The workstream index: a cheap incremental rollup over all session summaries —
// a diamond fan-in. Two facets: `rollup` (moves every render) and `cluster-gate`
// (moves ONLY when the DISTINCT workstream set changes — a major new project).
function workstreamIndexRender(deps: Deps): Render {
  return (ctx) => {
    const perSession: Record<string, unknown> = {};
    const workstreamSet = new Set<string>();
    let moved = 0;
    for (const sid of SESSIONS) {
      const s = readJson(deps.store, SUMMARY[sid]);
      if (s === null) continue;
      const ws = s["workstream"] as string | null;
      perSession[sid] = { rev: s["rev"], workstream: ws };
      if (ws) workstreamSet.add(ws);
      moved += 1;
    }
    const workstreams = [...workstreamSet].sort();
    return commit(
      {
        rollup: { per_session: perSession, total_sessions: moved },
        workstreams,
        workstream_count: workstreams.length,
      },
      renderCost(ctx, Math.max(1, moved), 2),
    );
  };
}

// The Concept Clusterer: the EXPENSIVE, batched node. It subscribes to ONLY the
// `cluster-gate` facet, so it stays DARK on small session deltas and wakes only
// when a new workstream appears — then it burns the single tall fresh spike.
function clustererRender(deps: Deps): Render {
  return (ctx) => {
    const wi = readJson(deps.store, WORKSTREAM_INDEX);
    const workstreams = (wi?.["workstreams"] ?? []) as string[];
    const clusters = workstreams.map((w, i) => ({
      cluster_id: `C${i}`,
      workstream: w,
      concepts: [`concept:${w}:a`, `concept:${w}:b`, `concept:${w}:c`],
    }));
    // The heavy fresh: it re-embeds/clusters EVERY workstream's concept space.
    const freshUnits = clusters.length * 3;
    return commit(
      { clusters, cluster_count: clusters.length },
      renderCost(ctx, Math.max(1, freshUnits), 3, FRESH_PER_UNIT * CLUSTERER_FRESH_MULTIPLIER),
    );
  };
}

// The terminal Agent Dashboard: renders the rollup + cluster summary. Reads the
// cheap `rollup` facet of the index and the clusterer's atomic truth.
function dashboardRender(deps: Deps): Render {
  return (ctx) => {
    const wi = readJson(deps.store, WORKSTREAM_INDEX);
    const cl = readJson(deps.store, CONCEPT_CLUSTERER);
    const rollup = (wi?.["rollup"] ?? {}) as Record<string, unknown>;
    return commit(
      {
        headline: `agent state: ${rollup["total_sessions"] ?? 0} sessions, ${
          (cl?.["cluster_count"] as number) ?? 0
        } clusters`,
        per_session: rollup["per_session"] ?? {},
        clusters: cl?.["clusters"] ?? [],
      },
      renderCost(ctx, 1, 2),
    );
  };
}

// ---------------------------------------------------------------------------
// Topology assembly
// ---------------------------------------------------------------------------

interface NodeDecl {
  readonly id: string;
  readonly kind: "gateway" | "responsibility";
  readonly requires: readonly { producer: string; facet?: Facet }[];
  readonly render: Render;
  readonly canonicalizer: (fm: WorldModelFiles) => Record<string, Fingerprint>;
}

function contractFingerprint(decl: NodeDecl): Fingerprint {
  return materialFingerprint({
    kind: decl.kind,
    id: decl.id,
    requires: decl.requires.map((r) => `${r.producer}:${r.facet ?? ATOMIC_FACET}`).sort(),
  });
}

function buildReconcilerTopology(decls: readonly NodeDecl[]): ReconcilerTopology {
  const contract_fingerprints: Record<string, Fingerprint> = {};
  for (const d of decls) contract_fingerprints[d.id] = contractFingerprint(d);

  const nodes: TopologyNode[] = decls.map((d) => ({
    node: asNodeId(d.id),
    contract_fingerprint: contract_fingerprints[d.id]!,
    wake_source: (d.kind === "gateway" ? "external" : "input") as WakeSource,
  }));
  const edges: TopologyEdge[] = decls.flatMap((d) =>
    d.requires.map((r) => ({
      subscriber: asNodeId(d.id),
      producer: asNodeId(r.producer),
      facet: r.facet ?? ATOMIC_FACET,
    })),
  );
  const entry_points = decls.filter((d) => d.kind === "gateway").map((d) => asNodeId(d.id));
  const declared = new Set(decls.map((d) => d.id));
  const topology: TopologyWorldModel = {
    nodes,
    edges,
    entry_points,
    acyclic: isAcyclic(declared, edges),
  };
  return { topology, contract_fingerprints };
}

function isAcyclic(
  declared: ReadonlySet<string>,
  edges: readonly { subscriber: string; producer: string }[],
): boolean {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!declared.has(e.producer) || !declared.has(e.subscriber)) continue;
    (adj.get(e.producer) ?? adj.set(e.producer, []).get(e.producer)!).push(e.subscriber);
  }
  const state = new Map<string, 0 | 1 | 2>();
  const visit = (n: string): boolean => {
    if (state.get(n) === 1) return false;
    if (state.get(n) === 2) return true;
    state.set(n, 1);
    for (const next of adj.get(n) ?? []) if (!visit(next)) return false;
    state.set(n, 2);
    return true;
  };
  for (const n of declared) if (!visit(n)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// The generator
// ---------------------------------------------------------------------------

export interface GenerateOptions {
  /** Absolute path of the state-dir to (re)create. */
  readonly stateDir: string;
  /** Wipe an existing dir first (default true) for a clean, deterministic build. */
  readonly clean?: boolean;
}

export interface GenerateResult {
  readonly stateDir: string;
  readonly receiptsCount: number;
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly facets: readonly Facet[];
}

/**
 * Build the deterministic Agent State Observatory state-dir at `opts.stateDir`.
 * Drives the scripted §3 beat timeline through the REAL reconciler over the
 * FileSystem store + ledger, then writes `compile/topology.json` +
 * `compile/labels.json`. Re-running with the same path reproduces the bytes.
 */
export function generateAgentObservatoryFixture(opts: GenerateOptions): GenerateResult {
  const { stateDir } = opts;
  if (opts.clean !== false && existsSync(stateDir)) {
    rmSync(stateDir, { recursive: true, force: true });
  }
  mkdirSync(stateDir, { recursive: true });

  // The one Substrate primitive: storage at `<stateDir>/receipts.json`, the
  // world-model store under `<stateDir>/world-models`, and the durable ledger
  // re-derived from that storage — one blessed factory for the split this
  // fixture wired by hand before.
  const { worldModel: store, ledger } = fileSystemSubstrate({
    directory: stateDir,
  });

  const deps: Deps = { store };

  const decls: NodeDecl[] = [
    {
      id: GATEWAY,
      kind: "gateway",
      // The gateway watches the whole agent-fs (atomic): any runtime slice moving
      // wakes it; its canonicalizer then splits the change into per-runtime facets.
      requires: [{ producer: SOURCE, facet: ATOMIC_FACET }],
      render: gatewayRender(deps),
      canonicalizer: gatewayCanon,
    },
    // Six runtime adapters — each subscribes to ONLY its own runtime facet.
    ...RUNTIMES.map<NodeDecl>((rt) => ({
      id: ADAPTER[rt],
      kind: "responsibility",
      requires: [{ producer: GATEWAY, facet: RUNTIME_FACET[rt] }],
      render: adapterRender(deps, rt),
      canonicalizer: atomicTruth,
    })),
    {
      id: SESSION_LEDGER,
      kind: "responsibility",
      // Fans in from all six adapters (atomic) — it merges every runtime's sessions.
      requires: RUNTIMES.map((rt) => ({ producer: ADAPTER[rt] })),
      render: sessionLedgerRender(deps),
      canonicalizer: sessionLedgerCanon,
    },
    // Three per-session summaries — each subscribes to ONLY its own session facet.
    ...SESSIONS.map<NodeDecl>((sid) => ({
      id: SUMMARY[sid],
      kind: "responsibility",
      requires: [{ producer: SESSION_LEDGER, facet: SESSION_FACET[sid] }],
      render: summaryRender(deps, sid),
      canonicalizer: atomicTruth,
    })),
    {
      id: WORKSTREAM_INDEX,
      kind: "responsibility",
      // DIAMOND fan-in from all three session summaries (atomic).
      requires: SESSIONS.map((sid) => ({ producer: SUMMARY[sid] })),
      render: workstreamIndexRender(deps),
      canonicalizer: workstreamIndexCanon,
    },
    {
      id: CONCEPT_CLUSTERER,
      kind: "responsibility",
      // Subscribes to ONLY the gating facet — stays dark unless a new workstream
      // appears. This is what makes the expensive node batch.
      requires: [{ producer: WORKSTREAM_INDEX, facet: CLUSTER_GATE_FACET }],
      render: clustererRender(deps),
      canonicalizer: atomicTruth,
    },
    {
      id: DASHBOARD,
      kind: "responsibility",
      // Reads the cheap rollup facet of the index + the clusterer's atomic truth.
      requires: [
        { producer: WORKSTREAM_INDEX, facet: ROLLUP_FACET },
        { producer: CONCEPT_CLUSTERER },
      ],
      render: dashboardRender(deps),
      canonicalizer: atomicTruth,
    },
  ];

  const reconcilerTopology = buildReconcilerTopology(decls);
  const mounts: Record<string, { render: Render; canonicalizer: NodeDecl["canonicalizer"] }> = {};
  for (const d of decls) mounts[d.id] = { render: d.render, canonicalizer: d.canonicalizer };

  const dag = mountDag({ topology: reconcilerTopology, mounts, store, ledger });

  // The mutable agent-fs the generator drives.
  const fs: AgentFs = seedFs();

  // Re-publish the agent-fs source and wake the gateway. When `fs` is
  // byte-identical to the prior publish, the gateway memo-skips and the whole
  // graph below it memo-skips too (the quiet-world re-wake).
  const publishAndWake = (): void => {
    const fm = files({ "agent-fs.json": jsonFile(fs) });
    const commitRes = store.commitPublished(SOURCE, fm, ingressCanon);
    const prev = ledger.lastReceipt(SOURCE);
    const prevRef = prev !== null ? ledger.addressOf(prev) : null;
    const wake = externalWake();
    ledger.append({
      node: asNodeId(SOURCE),
      contract_fingerprint: asFingerprint(`contract:${SOURCE}@ingress`),
      wake,
      input_fingerprints: [],
      fingerprints: commitRes.fingerprints,
      semantic_diff: EMPTY_SEMANTIC_DIFF,
      prev: prevRef,
      status: "rendered",
      cost: zeroCost("external"),
      sig: createNullSignature(),
    });
    dag.ingest(GATEWAY);
  };

  // Mutate exactly one runtime's slice (so exactly one runtime facet moves).
  const editSession = (
    sid: SessionId,
    patch: Partial<Pick<SessionState, "head" | "workstream" | "corrupt">>,
  ): void => {
    const rt = SESSION_RUNTIME[sid];
    const list = fs[rt];
    const idx = list.findIndex((s) => s.id === sid);
    if (idx < 0) return;
    const prev = list[idx]!;
    list[idx] = {
      ...prev,
      rev: prev.rev + 1,
      head: patch.head ?? prev.head,
      workstream: patch.workstream ?? prev.workstream,
      corrupt: patch.corrupt ?? false,
    };
    publishAndWake();
  };

  // ======================================================================
  // The scripted §3 beat timeline.
  // ======================================================================

  // --- Beat 1: COLD BOOT. Seed every source; every node renders once — a full
  // flash cascade across all 13 nodes (the graph "lighting up" once).
  publishAndWake();

  // --- Beat 2: QUIET STRETCH. Byte-identical re-scans: the WHOLE graph
  // memo-SKIPS — a long field of dim skip pulses, the fresh-line flat near zero.
  // (Long on purpose: the "cost scales with surprise" boring half.)
  publishAndWake();
  publishAndWake();
  publishAndWake();

  // --- Beat 3: SELF-TICK FLOOR. A lone self-sourced wake on the Concept
  // Clusterer in the quiet world. Its gating input has not moved ⇒ a `self`
  // skipped receipt that lights no edges and costs ~nothing (the audit floor).
  dag.tick(CONCEPT_CLUSTERER);
  dag.tick(CONCEPT_CLUSTERER);

  // a little more quiet so the floor reads as flat before the surprise.
  publishAndWake();

  // --- Beat 4: THE HERO. One Claude session (claudeA) gets a new turn. ONLY the
  // `claude` runtime facet moves ⇒ ONLY the Claude Adapter lane lights; the five
  // sibling adapter lanes stay DARK. ONLY `session:claudeA` moves ⇒ only
  // summary-claudeA wakes; claudeB / codexA stay dark. workstream-index flashes
  // once; the cost meter ticks ONCE off the flat line. (No new workstream, so
  // the Clusterer stays dark.)
  editSession("claudeA", { head: "wire the per-runtime facet canonicalizer" });

  // --- Beat 5: DIAMOND. A delta touching claudeA AND codexA in one drain — two
  // session summaries move; workstream-index is woken EXACTLY ONCE (convergent),
  // not twice. We mutate both runtime slices, then a SINGLE publish+drain.
  {
    // edit claudeA
    const ca = fs.claude.find((s) => s.id === "claudeA")!;
    fs.claude[fs.claude.indexOf(ca)] = { ...ca, rev: ca.rev + 1, head: "tighten the dark-lane test" };
    // edit codexA in the same FS snapshot
    const cx = fs.codex.find((s) => s.id === "codexA")!;
    fs.codex[fs.codex.indexOf(cx)] = { ...cx, rev: cx.rev + 1, head: "green the cli error-code assert" };
    publishAndWake(); // single drain — both lanes light, index woken once
  }

  // --- Beat 6: FAIL. A corrupt Codex session JSONL — the Codex Adapter THROWS
  // ⇒ a `failed` receipt (red node), no downstream lights, prior truth stands.
  editSession("codexA", { corrupt: true });

  // --- Beat 7: RECOVER. The next Codex delivery parses cleanly ⇒ the Codex
  // Adapter flashes green; its lane lights; summary-codexA wakes.
  editSession("codexA", { head: "codex session recovered cleanly" });

  // --- Beat 8: BATCH SPIKE. A "major new project" delta: a big refactor fans the
  // sessions out across SEVERAL brand-new distinct workstreams in one drain. The
  // distinct-workstream set jumps from 1 ("bootstrap") to 3 ⇒ the workstream-index
  // `cluster-gate` facet moves hard ⇒ the expensive Concept Clusterer finally
  // wakes and re-embeds the whole expanded concept space: the single tall fresh
  // spike off the now-flat line. Mutate all three sessions, then ONE drain.
  {
    const ca = fs.claude.find((s) => s.id === "claudeA")!;
    fs.claude[fs.claude.indexOf(ca)] = {
      ...ca, rev: ca.rev + 1, workstream: "observatory-launch",
      head: "spin up the observatory launch project",
    };
    const cb = fs.claude.find((s) => s.id === "claudeB")!;
    fs.claude[fs.claude.indexOf(cb)] = {
      ...cb, rev: cb.rev + 1, workstream: "growth-loops",
      head: "open the growth-loops workstream",
    };
    const cx = fs.codex.find((s) => s.id === "codexA")!;
    fs.codex[fs.codex.indexOf(cx)] = {
      ...cx, rev: cx.rev + 1, workstream: "infra-migration",
      head: "kick off the infra migration",
    };
    publishAndWake(); // single drain — distinct workstreams 1 → 3, clusterer spikes
  }

  // --- Beat 9: FINAL QUIET. Byte-identical re-scans — back to dim pulses, flat
  // line (the bookend: it goes quiet again). LONG enough (≥ SPARK_WINDOW frames)
  // that the batch spike scrolls fully out of the sparkline window, so the final
  // bookend still reads genuinely flat near zero — the inverse of the spike, not
  // a spike still decaying in view (review #4/#5).
  publishAndWake();
  publishAndWake();
  publishAndWake();
  publishAndWake();
  publishAndWake();
  publishAndWake();
  publishAndWake();
  publishAndWake();

  // --- Persist the topology snapshot (MANDATORY for replay; plan R2) -------
  const compileDir = join(stateDir, "compile");
  mkdirSync(compileDir, { recursive: true });
  writeFileSync(
    join(compileDir, "topology.json"),
    `${JSON.stringify(reconcilerTopology.topology, null, 2)}\n`,
    "utf8",
  );
  // The friendly labels map for the SPA (nodeId → human label).
  writeFileSync(
    join(compileDir, "labels.json"),
    `${JSON.stringify(LABELS, null, 2)}\n`,
    "utf8",
  );

  const receipts = ledger.all();
  return {
    stateDir,
    receiptsCount: receipts.length,
    nodeCount: reconcilerTopology.topology.nodes.length,
    edgeCount: reconcilerTopology.topology.edges.length,
    facets: [
      ...RUNTIMES.map((rt) => RUNTIME_FACET[rt]),
      ...SESSIONS.map((sid) => SESSION_FACET[sid]),
      ROLLUP_FACET,
      CLUSTER_GATE_FACET,
    ],
  };
}
