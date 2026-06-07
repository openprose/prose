// agent-observatory — the multi-agent observatory learning example GENERATOR.
//
// It drives the REAL @openprose/reactor reconciler with DETERMINISTIC fake
// renders (NO model key) through the public SDK primitives, then freezes the
// `replay/` state-dir the way every devtools fixture does — PLUS a self-written
// `beats.json` and `labels.json`, so a regeneration is LOSSLESS (the plan's
// determinism boundary; §6 "the generators must self-write beats.json").
//
// THE STORY (the tenet this example teaches):
//   Your laptop is a sprawling multi-runtime agent state machine — Claude Code,
//   Codex, OpenCode, Pi. ONE "Runtime Watch" gateway watches a normalized
//   agent-fs and exposes ONE INDEPENDENT FACET TOKEN PER RUNTIME. Four runtime
//   adapters each subscribe to ONLY their own runtime facet — the quiet
//   watchers. A change to a single Claude session moves ONLY the `claude` facet
//   ⇒ ONLY the Claude Adapter lane lights; the three sibling adapter lanes stay
//   DARK. The adapters feed a Session Ledger that exposes a `session:<id>` facet
//   per active session; each per-session Summary subscribes to exactly one. The
//   summaries fan into a Workstream Index (a DIAMOND — woken exactly ONCE even
//   when two summaries move). A gating facet ("cluster-gate") drives the
//   expensive, BATCHED Concept Clusterer, which stays DARK on small deltas and
//   spikes only on a "major new project" delta. A folded-in Session → Prose node
//   watches one Claude transcript and emits a generalized `.prose` contract. Two
//   terminal artifacts — an Agent Index (Markdown) and an Agent Dashboard (HTML)
//   — render the rollup (the dual MD+HTML artifact tenet).
//
// State-dir shape (identical to the devtools fixtures so reactor-devtools can
// replay it unchanged):
//   replay/receipts.json                 (flat root append-only ledger trail)
//   replay/world-models/<hexNodeId>/…    (per-node published truth + history)
//   replay/compile/topology.json         (the flat TopologyWorldModel)
//   replay/compile/labels.json           (nodeId → friendly label)
//   replay/beats.json                    (the scripted beat timeline; self-written)

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";

import {
  createFileSystemStorageAdapter,
} from "@openprose/reactor";
import {
  FileSystemWorldModelStore,
  fingerprintArtifact,
} from "@openprose/reactor/adapters";

import {
  mountDag,
  files,
  jsonFile,
  textFile,
  ATOMIC_FACET,
  type Cost,
  type WakeSource,
  type Wake,
  type RenderContext,
  type RenderProduct,
} from "@openprose/reactor";
import {
  FileSystemReceiptLedger,
  readTextFile,
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
  type ReconcilerTopology,
} from "@openprose/reactor/internals";

// ---------------------------------------------------------------------------
// Node identities. The friendly labels the SPA shows come from LABELS below;
// the ids stay namespaced for the topology.
// ---------------------------------------------------------------------------

const SOURCE = "ingress.agent-fs"; // the phantom edge: the normalized agent filesystem
const GATEWAY = "gateway.runtime-watch"; // the single entry point; ONE facet per runtime

// Four runtimes — the row of watchers that is mostly DARK in the hero beat.
const RUNTIMES = ["claude", "codex", "opencode", "pi"] as const;
type Runtime = (typeof RUNTIMES)[number];

const ADAPTER: Record<Runtime, string> = {
  claude: "responsibility.adapter-claude",
  codex: "responsibility.adapter-codex",
  opencode: "responsibility.adapter-opencode",
  pi: "responsibility.adapter-pi",
};

const SESSION_LEDGER = "responsibility.session-ledger";

// Three active sessions across two runtimes (two Claude, one Codex).
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

// The folded-in Session → Prose node: watches ONE Claude transcript (claudeA)
// and emits a generalized OpenProse contract from it.
const SESSION_TO_PROSE = "responsibility.session-to-prose";
const TRANSCRIPT_SESSION: SessionId = "claudeA";

const WORKSTREAM_INDEX = "responsibility.workstream-index";
const CONCEPT_CLUSTERER = "responsibility.concept-clusterer";
// Two terminal artifacts — the dual MD + HTML tenet.
const INDEX_MARKDOWN = "responsibility.index-markdown";
const DASHBOARD_HTML = "responsibility.dashboard-html";

// --- Facet tokens -----------------------------------------------------------

// One INDEPENDENT facet per runtime on the gateway — the dark-lane boundary.
const RUNTIME_FACET: Record<Runtime, Facet> = {
  claude: "claude",
  codex: "codex",
  opencode: "opencode",
  pi: "pi",
};

// One facet per session on the session ledger — the second dark lane.
const SESSION_FACET: Record<SessionId, Facet> = {
  claudeA: "session:claudeA",
  claudeB: "session:claudeB",
  codexA: "session:codexA",
};

// The Workstream Index exposes two facets:
//   - `rollup`: the cheap incremental rollup the artifacts read (moves every render).
//   - `cluster-gate`: the GATING facet the expensive Clusterer reads. It moves
//     ONLY when the DISTINCT workstream set changes (a "major new project").
const CLUSTER_GATE_FACET: Facet = "cluster-gate";
const ROLLUP_FACET: Facet = "rollup";

// ---------------------------------------------------------------------------
// Friendly labels for the SPA (nodeId → human label). Normalized: present for
// every node, including the phantom ingress source.
// ---------------------------------------------------------------------------

const LABELS: Record<string, string> = {
  [SOURCE]: "Agent FS",
  [GATEWAY]: "Runtime Watch",
  [ADAPTER.claude]: "Claude Adapter",
  [ADAPTER.codex]: "Codex Adapter",
  [ADAPTER.opencode]: "OpenCode Adapter",
  [ADAPTER.pi]: "Pi Adapter",
  [SESSION_LEDGER]: "Session Ledger",
  [SUMMARY.claudeA]: "Session Summary [claudeA]",
  [SUMMARY.claudeB]: "Session Summary [claudeB]",
  [SUMMARY.codexA]: "Session Summary [codexA]",
  [SESSION_TO_PROSE]: "Session → Prose",
  [WORKSTREAM_INDEX]: "Workstream Index",
  [CONCEPT_CLUSTERER]: "Concept Clusterer",
  [INDEX_MARKDOWN]: "Agent Index (Markdown)",
  [DASHBOARD_HTML]: "Agent Dashboard (HTML)",
};

// ---------------------------------------------------------------------------
// Deterministic fingerprint of a structured sub-value (own facet tokens). A
// facet token moves iff its projected sub-value moves.
// ---------------------------------------------------------------------------

function materialFingerprint(value: unknown): Fingerprint {
  return `sha256:${createHash("sha256").update(stableStringify(value)).digest("hex")}`;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const entries = Object.keys(value as Record<string, unknown>)
    .sort()
    .map(
      (k) =>
        `${JSON.stringify(k)}:${stableStringify(
          (value as Record<string, unknown>)[k],
        )}`,
    );
  return `{${entries.join(",")}}`;
}

// ---------------------------------------------------------------------------
// The cost model — what makes the token meter sing. Fresh tokens scale with how
// much NEW material a render digested; the parts it reused count as REUSED. The
// reconciler stamps `skipped` receipts with zeroCost (fresh:0). The Clusterer's
// fresh is deliberately heavy so the batch beat is a single tall spike off a
// flat line. `surprise_cause` MUST equal the wake source (receipt validation
// enforces it), so it is ALWAYS read off `ctx.wake.source`.
// ---------------------------------------------------------------------------

const FRESH_PER_UNIT = 180;
const REUSED_FLOOR = 240;
const CLUSTERER_FRESH_MULTIPLIER = 9;

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
    surprise_cause: ctx.wake.source, // NEVER hardcoded — read off the wake.
  };
}

// ---------------------------------------------------------------------------
// The agent-fs payload: a flat map of per-runtime session state. A "delta"
// mutates exactly one runtime's slice (so exactly one runtime facet moves).
// ---------------------------------------------------------------------------

interface SessionState {
  readonly id: SessionId;
  readonly runtime: Runtime;
  readonly rev: number;
  readonly head: string;
  readonly workstream: string;
  readonly corrupt?: boolean;
}

type AgentFs = Record<Runtime, SessionState[]>;

function seedFs(): AgentFs {
  // Cold boot starts with a SINGLE shared workstream ("bootstrap") so the cold
  // cascade does not plant a tall fresh spike that rivals the batch beat.
  return {
    claude: [
      { id: "claudeA", runtime: "claude", rev: 1, head: "scaffold reactor devtools", workstream: "bootstrap" },
      { id: "claudeB", runtime: "claude", rev: 1, head: "draft launch plan", workstream: "bootstrap" },
    ],
    codex: [{ id: "codexA", runtime: "codex", rev: 1, head: "port cli tests", workstream: "bootstrap" }],
    opencode: [],
    pi: [],
  };
}

// ---------------------------------------------------------------------------
// Reading upstream truth by reference (what a fake render does).
// ---------------------------------------------------------------------------

function readJson<T = Record<string, unknown>>(
  store: WorldModelStore,
  node: string,
  path = "truth.json",
): T | null {
  const read = store.read(node, "published");
  if (read.ref.version === null) return null;
  const bytes = read.files[path];
  if (bytes === undefined) return null;
  return JSON.parse(readTextFile(bytes)) as T;
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
// Canonicalizers (which facets a node's truth exposes).
// ---------------------------------------------------------------------------

const atomicTruth = (fm: WorldModelFiles) => ({
  [ATOMIC_FACET]: fingerprintArtifact(fm),
});

const ingressCanon = (fm: WorldModelFiles) => {
  const bytes = fm["agent-fs.json"];
  const fs: Partial<AgentFs> =
    bytes === undefined ? {} : (JSON.parse(readTextFile(bytes)) as AgentFs);
  const out: Record<string, Fingerprint> = { [ATOMIC_FACET]: fingerprintArtifact(fm) };
  for (const rt of RUNTIMES) {
    out[RUNTIME_FACET[rt]] = materialFingerprint(fs[rt] ?? []);
  }
  return out;
};

// THE dark-lane boundary. The gateway re-projects each runtime slice into an
// INDEPENDENT facet token. A Claude-only change moves ONLY `claude`.
const gatewayCanon = (fm: WorldModelFiles) => {
  const t = readTruth(fm);
  const runtimes = (t["runtimes"] ?? {}) as Record<string, unknown>;
  const out: Record<string, Fingerprint> = { [ATOMIC_FACET]: fingerprintArtifact(fm) };
  for (const rt of RUNTIMES) {
    out[RUNTIME_FACET[rt]] = materialFingerprint(runtimes[rt] ?? []);
  }
  return out;
};

// The session ledger exposes one facet per active session (the second dark lane).
const sessionLedgerCanon = (fm: WorldModelFiles) => {
  const t = readTruth(fm);
  const sessions = (t["sessions"] ?? {}) as Record<string, unknown>;
  const out: Record<string, Fingerprint> = { [ATOMIC_FACET]: fingerprintArtifact(fm) };
  for (const sid of SESSIONS) {
    out[SESSION_FACET[sid]] = materialFingerprint(sessions[sid] ?? null);
  }
  return out;
};

// The Workstream Index exposes `rollup` (moves every render) and `cluster-gate`
// (moves iff a brand new workstream appears — the batch gate).
const workstreamIndexCanon = (fm: WorldModelFiles) => {
  const t = readTruth(fm);
  return {
    [ATOMIC_FACET]: fingerprintArtifact(fm),
    [ROLLUP_FACET]: materialFingerprint(t["rollup"] ?? null),
    [CLUSTER_GATE_FACET]: materialFingerprint(t["workstreams"] ?? []),
  };
};

// ---------------------------------------------------------------------------
// Render bodies (pure deterministic fakes; cost scales with material moved).
// ---------------------------------------------------------------------------

interface Deps {
  readonly store: WorldModelStore;
}

type Render = (ctx: RenderContext) => RenderProduct;

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

// A runtime adapter reads ONLY its own runtime slice off the gateway. The Codex
// adapter THROWS when a session is flagged corrupt (the fail beat).
function adapterRender(deps: Deps, runtime: Runtime): Render {
  return (ctx) => {
    const gw = readJson(deps.store, GATEWAY);
    const runtimes = (gw?.["runtimes"] ?? {}) as Record<string, SessionState[]>;
    const mine = runtimes[runtime] ?? [];
    const normalized = mine.map((s) => {
      if (s.corrupt) {
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

// THE FOLDED-IN Session → Prose node. It watches ONE Claude transcript
// (claudeA) off the session ledger and emits a generalized OpenProse contract
// (`program.prose.md`) from the session's workflow. It subscribes to exactly
// one `session:claudeA` facet, so it stays DARK unless that transcript moves —
// the old session-to-prose meta-generator, restructured as a standing
// responsibility inside the observatory.
function sessionToProseRender(deps: Deps): Render {
  return (ctx) => {
    const ledger = readJson(deps.store, SESSION_LEDGER);
    const sessions = (ledger?.["sessions"] ?? {}) as Record<string, Record<string, unknown>>;
    const me = sessions[TRANSCRIPT_SESSION] ?? null;
    const head = (me?.["head"] as string) ?? "";
    const rev = (me?.["rev"] as number) ?? 0;
    // A deterministic stand-in for the compiled contract: a `kind: function`
    // OpenProse program generalized from the watched transcript.
    const program = [
      `---`,
      `name: ${TRANSCRIPT_SESSION}-workflow`,
      `kind: function`,
      `---`,
      ``,
      `### Description`,
      ``,
      `Generalized from the watched ${TRANSCRIPT_SESSION} transcript (rev ${rev}).`,
      `Latest head: ${head}`,
    ].join("\n");
    return commit(
      {
        watched_session: TRANSCRIPT_SESSION,
        watched_rev: rev,
        program_kind: "function",
        program,
        program_content_hash: materialFingerprint(program),
      },
      renderCost(ctx, 2, 1),
    );
  };
}

// The Workstream Index: a cheap incremental rollup over all session summaries —
// a DIAMOND fan-in. `rollup` moves every render; `cluster-gate` moves only when
// the distinct workstream set changes.
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

// The Concept Clusterer: the EXPENSIVE, batched node. Subscribes to ONLY the
// `cluster-gate` facet, so it stays DARK on small session deltas and only wakes
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
    const freshUnits = clusters.length * 3;
    return commit(
      { clusters, cluster_count: clusters.length },
      renderCost(ctx, Math.max(1, freshUnits), 3, FRESH_PER_UNIT * CLUSTERER_FRESH_MULTIPLIER),
    );
  };
}

// Terminal artifact #1: the Agent Index (Markdown). Reads the cheap `rollup`
// facet of the index, the clusterer's atomic truth, AND the Session → Prose
// program (the folded-in node feeds the index).
function indexMarkdownRender(deps: Deps): Render {
  return (ctx) => {
    const wi = readJson(deps.store, WORKSTREAM_INDEX);
    const cl = readJson(deps.store, CONCEPT_CLUSTERER);
    const s2p = readJson(deps.store, SESSION_TO_PROSE);
    const rollup = (wi?.["rollup"] ?? {}) as Record<string, unknown>;
    const md = [
      `# Agent Observatory`,
      ``,
      `- sessions: ${rollup["total_sessions"] ?? 0}`,
      `- clusters: ${(cl?.["cluster_count"] as number) ?? 0}`,
      `- extracted program: ${(s2p?.["watched_session"] as string) ?? "(none)"} (rev ${(s2p?.["watched_rev"] as number) ?? 0})`,
    ].join("\n");
    return commit(
      {
        path: "agent-index.md",
        markdown: md,
        content_hash: materialFingerprint(md),
      },
      renderCost(ctx, 1, 2),
    );
  };
}

// Terminal artifact #2: the Agent Dashboard (HTML). Reads the cheap `rollup`
// facet of the index + the clusterer's atomic truth, renders a static HTML view.
function dashboardHtmlRender(deps: Deps): Render {
  return (ctx) => {
    const wi = readJson(deps.store, WORKSTREAM_INDEX);
    const cl = readJson(deps.store, CONCEPT_CLUSTERER);
    const rollup = (wi?.["rollup"] ?? {}) as Record<string, unknown>;
    const html = `<!doctype html><html><body><h1>Agent State</h1><p>${
      rollup["total_sessions"] ?? 0
    } sessions, ${(cl?.["cluster_count"] as number) ?? 0} clusters</p></body></html>`;
    return commit(
      {
        path: "agent-dashboard.html",
        html,
        content_hash: materialFingerprint(html),
      },
      renderCost(ctx, 1, 2),
    );
  };
}

// ---------------------------------------------------------------------------
// Topology assembly.
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
    node: d.id,
    contract_fingerprint: contract_fingerprints[d.id]!,
    wake_source: (d.kind === "gateway" ? "external" : "input") as WakeSource,
  }));
  const edges: TopologyEdge[] = decls.flatMap((d) =>
    d.requires.map((r) => ({
      subscriber: d.id,
      producer: r.producer,
      facet: r.facet ?? ATOMIC_FACET,
    })),
  );
  const entry_points = decls.filter((d) => d.kind === "gateway").map((d) => d.id);
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
// The scripted beat timeline (self-written to beats.json so a regen is lossless).
// ---------------------------------------------------------------------------

interface Beat {
  readonly name: string;
  readonly park: number;
  readonly from: number;
  readonly to: number;
  readonly holdMs: number;
  readonly caption: string;
}

// ---------------------------------------------------------------------------
// The generator.
// ---------------------------------------------------------------------------

export interface GenerateOptions {
  readonly stateDir: string;
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
 * Build the deterministic agent-observatory state-dir at `opts.stateDir`. Drives
 * the scripted beat timeline through the REAL reconciler over the FileSystem
 * store + ledger, then writes `compile/topology.json`, `compile/labels.json`,
 * and `beats.json`. Re-running with the same path reproduces the bytes.
 */
export function generateAgentObservatory(opts: GenerateOptions): GenerateResult {
  const { stateDir } = opts;
  if (opts.clean !== false && existsSync(stateDir)) {
    rmSync(stateDir, { recursive: true, force: true });
  }
  mkdirSync(stateDir, { recursive: true });

  const worldModelDir = join(stateDir, "world-models");
  const store = new FileSystemWorldModelStore({ directory: worldModelDir });
  const storage = createFileSystemStorageAdapter({ directory: stateDir });
  const ledger = new FileSystemReceiptLedger({ storage });

  const deps: Deps = { store };

  const decls: NodeDecl[] = [
    {
      id: GATEWAY,
      kind: "gateway",
      requires: [{ producer: SOURCE, facet: ATOMIC_FACET }],
      render: gatewayRender(deps),
      canonicalizer: gatewayCanon,
    },
    // Four runtime adapters — each subscribes to ONLY its own runtime facet.
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
      id: SESSION_TO_PROSE,
      kind: "responsibility",
      // Watches ONLY the claudeA transcript facet.
      requires: [{ producer: SESSION_LEDGER, facet: SESSION_FACET[TRANSCRIPT_SESSION] }],
      render: sessionToProseRender(deps),
      canonicalizer: atomicTruth,
    },
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
      requires: [{ producer: WORKSTREAM_INDEX, facet: CLUSTER_GATE_FACET }],
      render: clustererRender(deps),
      canonicalizer: atomicTruth,
    },
    {
      id: INDEX_MARKDOWN,
      kind: "responsibility",
      requires: [
        { producer: WORKSTREAM_INDEX, facet: ROLLUP_FACET },
        { producer: CONCEPT_CLUSTERER },
        { producer: SESSION_TO_PROSE },
      ],
      render: indexMarkdownRender(deps),
      canonicalizer: atomicTruth,
    },
    {
      id: DASHBOARD_HTML,
      kind: "responsibility",
      requires: [
        { producer: WORKSTREAM_INDEX, facet: ROLLUP_FACET },
        { producer: CONCEPT_CLUSTERER },
      ],
      render: dashboardHtmlRender(deps),
      canonicalizer: atomicTruth,
    },
  ];

  const reconcilerTopology = buildReconcilerTopology(decls);
  const mounts: Record<string, { render: Render; canonicalizer: NodeDecl["canonicalizer"] }> = {};
  for (const d of decls) mounts[d.id] = { render: d.render, canonicalizer: d.canonicalizer };

  const dag = mountDag({ topology: reconcilerTopology, mounts, store, ledger });

  const fs: AgentFs = seedFs();

  const publishAndWake = (): void => {
    const fm = files({ "agent-fs.json": jsonFile(fs) });
    const commitRes = store.commitPublished(SOURCE, fm, ingressCanon);
    const prev = ledger.lastReceipt(SOURCE);
    const prevRef = prev !== null ? ledger.addressOf(prev) : null;
    const wake: Wake = { source: "external", refs: [] };
    ledger.append({
      node: SOURCE,
      contract_fingerprint: `contract:${SOURCE}@ingress`,
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

  // Track frame indices so beats.json is anchored to real receipt positions.
  const frame = (): number => ledger.all().length - 1;
  const beats: Beat[] = [];
  const beat = (name: string, from: number, to: number, caption: string, holdMs = 3000): void => {
    beats.push({ name, park: to, from, to, holdMs, caption });
  };

  // === Beat 1: COLD BOOT — every node renders once (the full flash cascade). ===
  const coldFrom = ledger.all().length;
  publishAndWake();
  beat("cold-boot", coldFrom, frame(), "the observatory wires up · 14 nodes lit once", 2600);

  // === Beat 2: QUIET STRETCH — byte-identical re-scans memo-SKIP the graph. ===
  const quietFrom = ledger.all().length;
  publishAndWake();
  publishAndWake();
  publishAndWake();
  beat("quiet", quietFrom, frame(), "no session changed · every re-tick memo-skips · cost flat near zero", 2800);

  // === Beat 3: SELF-TICK FLOOR — a lone self-sourced wake on the Clusterer. ===
  const selfFrom = ledger.all().length;
  dag.tick(CONCEPT_CLUSTERER);
  dag.tick(CONCEPT_CLUSTERER);
  beat("self-tick", selfFrom, frame(), "self-tick audit floor · the Clusterer re-checks itself · no input, no cost", 2400);
  publishAndWake(); // a little more quiet

  // === Beat 4: THE HERO — one Claude session moves ⇒ only the Claude lane. ===
  const heroFrom = ledger.all().length;
  editSession("claudeA", { head: "wire the per-runtime facet canonicalizer" });
  beat("hero-one-runtime", heroFrom, frame(), "HERO: one Claude turn · only the Claude lane lights · 3 sibling adapters DARK · the index re-writes ONCE", 3800);

  // === Beat 5: DIAMOND — claudeA AND codexA in one drain; index woken once. ===
  const diamondFrom = ledger.all().length;
  {
    const ca = fs.claude.find((s) => s.id === "claudeA")!;
    fs.claude[fs.claude.indexOf(ca)] = { ...ca, rev: ca.rev + 1, head: "tighten the dark-lane test" };
    const cx = fs.codex.find((s) => s.id === "codexA")!;
    fs.codex[fs.codex.indexOf(cx)] = { ...cx, rev: cx.rev + 1, head: "green the cli error-code assert" };
    publishAndWake();
  }
  beat("diamond", diamondFrom, frame(), "two sessions move in one drain · the Workstream Index is woken EXACTLY once", 3400);

  // === Beat 6: FAIL — a corrupt Codex session JSONL ⇒ the Codex adapter throws. ===
  const failFrom = ledger.all().length;
  editSession("codexA", { corrupt: true });
  beat("red-fail", failFrom, frame(), "a corrupt Codex dispatch fails RED · no downstream · prior truth stands", 3000);

  // === Beat 7: RECOVER — the next Codex delivery parses cleanly. ===
  const recoverFrom = ledger.all().length;
  editSession("codexA", { head: "codex session recovered cleanly" });
  beat("recover", recoverFrom, frame(), "the next Codex delivery parses · the Codex lane re-lights green", 2800);

  // === Beat 8: BATCH SPIKE — a "major new project" delta; clusterer wakes once. ===
  const batchFrom = ledger.all().length;
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
    publishAndWake();
  }
  beat("batch-spike", batchFrom, frame(), "a major-new-project delta · distinct workstreams 1 → 3 · the Clusterer wakes ONCE · the single tall spike", 4000);

  // === Beat 9: FINAL QUIET — byte-identical re-scans, flat line bookend. ===
  const finalFrom = ledger.all().length;
  publishAndWake();
  publishAndWake();
  publishAndWake();
  publishAndWake();
  publishAndWake();
  publishAndWake();
  beat("final-quiet", finalFrom, frame(), "the laptop goes quiet again · every re-tick memo-skips · flat line bookend", 2800);

  // --- Persist the compile snapshot + labels (MANDATORY for replay). ---
  const compileDir = join(stateDir, "compile");
  mkdirSync(compileDir, { recursive: true });
  writeFileSync(
    join(compileDir, "topology.json"),
    `${JSON.stringify(reconcilerTopology.topology, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    join(compileDir, "labels.json"),
    `${JSON.stringify(LABELS, null, 2)}\n`,
    "utf8",
  );

  // --- Self-write the scripted beat timeline so a regen is LOSSLESS. ---
  const beatsDoc = {
    scenario: "agent-observatory",
    title:
      "Many cheap watchers, one expensive synthesis. Your agent dashboard only re-writes when some session state actually changed.",
    beats,
  };
  writeFileSync(join(stateDir, "beats.json"), `${JSON.stringify(beatsDoc, null, 2)}\n`, "utf8");

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

// Allow `tsx generate.ts` / `node generate.js` to regenerate the committed dir.
if (require.main === module) {
  const here = __dirname;
  const result = generateAgentObservatory({ stateDir: join(here, "replay") });
  // eslint-disable-next-line no-console
  console.log(
    `agent-observatory: ${result.receiptsCount} receipts · ${result.nodeCount} nodes · ${result.edgeCount} edges`,
  );
}
