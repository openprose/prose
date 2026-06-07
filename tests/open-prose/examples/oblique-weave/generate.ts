// The oblique-weave GENERATOR — produces a deterministic, replayable `replay/`
// state-dir whose lesson is HIDDEN-CONTEXT ADVERSARIAL ROLE COMPOSITION:
//   - roles are FIRST-CLASS SUBSCRIBERS, each with a DIFFERENT MASKED VIEWPORT of
//     the same underlying truth (the Viewport Policy exposes one masked facet per
//     role; a role wakes only when ITS masked view moves);
//   - a TERMINAL Novelty Auditor whose recommendation becomes a NEW EXPLICIT
//     `Weave Config` receipt the NEXT epoch — DAG-preserving, no same-epoch cycle
//     (applying the recommendation is modeled as a fresh external Weave Config
//     wake, exactly as the spec demands).
//
// It is a sibling of the devtools `news-desk` / `masked-relay` fixtures and the
// `surprise-cost` example, and reuses ONLY the public, exported SDK primitives;
// no SDK change is required.
//
// THE STORY (the four epochs the beats.json scripts):
//   epoch1  COLD       — the world wakes up. Both gateways (Product Signal Inbox,
//                        Weave Config) render, the signal ledger renders, the
//                        viewport policy projects one masked view per role, all
//                        four roles render, the oblique ledger merges them, the
//                        surprising-bet memo renders, the novelty auditor renders.
//                        Every node lights once.
//   epoch2  QUIET      — an IDENTICAL re-wake of the Signal Inbox. Nothing moved,
//                        so the memo key is a HIT: the signal-ledger memo-SKIPS,
//                        and a skip propagates nothing, so NOTHING downstream wakes.
//                        The marquee frame: skipped, moved[—], fresh 0.
//   epoch3  SURPRISE   — a real new founder hunch lands on the Signal Inbox. The
//                        ledger moves; the viewport policy re-projects, but ONLY
//                        the ANALOGIST's masked facet moves (the hunch is routed to
//                        the analogist's viewport by the seed) ⇒ ONLY the Analogist
//                        re-renders; the three sibling roles stay DARK (hidden
//                        context: different masked viewport of the same truth). The
//                        oblique ledger, memo, and auditor re-render down the spine.
//   epoch4  RE-WEAVE   — the Novelty Auditor's recommended viewport shift arrives
//                        as a NEW EXPLICIT Weave Config receipt (a fresh external
//                        wake — NOT a same-epoch cycle). The viewport policy
//                        re-seeds; this time the ADVERSARY's masked facet moves ⇒
//                        the Adversary re-renders and the surprise propagates down
//                        to a re-audited memo. The terminal recommendation closed
//                        the loop ACROSS an epoch boundary, the DAG intact.
//
// THE TENET: a node renders IFF its memo key (contract_fingerprint,
// input_fingerprints) actually MOVED. The Viewport Policy's per-role masked
// facets are the mechanism that gives each role a DIFFERENT slice of the same
// truth — a change that only perturbs one role's masked view wakes only that role.
//
// `cost.surprise_cause` is ALWAYS read off `ctx.wake.source` (the reconciler
// verifies this invariant on commit) — never hardcoded.
//
// It persists the SAME full state-dir shape the devtools fixtures do, so
// reactor-devtools can replay it unchanged:
//
//   replay/receipts.json              (durable append-only ledger trail, FLAT root)
//   replay/world-models/<hexNodeId>/… (per-node published truth + version history)
//   replay/compile/topology.json      (the flat TopologyWorldModel the SPA draws)
//   replay/compile/labels.json        (nodeId → friendly label for the SPA)
//   replay/beats.json                 (the scripted cold→quiet→surprise→re-weave
//                                       beat map, self-written so a regen is LOSSLESS)
//
// Determinism: every render is a PURE function of upstream truth read by
// reference; cost is a pure function of how much actually moved. Same generator
// ⇒ byte-identical state-dir ⇒ the same replay every time.

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";

import {
  mountDag,
  createFileSystemStorageAdapter,
  files,
  jsonFile,
  ATOMIC_FACET,
  type Cost,
  type WakeSource,
} from "@openprose/reactor";
import {
  FileSystemWorldModelStore,
  FileSystemReceiptLedger,
  readTextFile,
  fingerprintArtifact,
  type WorldModelStore,
  type WorldModelFiles,
} from "@openprose/reactor/adapters";
import type {
  Fingerprint,
  Facet,
  TopologyWorldModel,
  TopologyNode,
  TopologyEdge,
} from "@openprose/reactor/internals";

import type {
  RenderContext,
  RenderProduct,
} from "@openprose/reactor";
import type {
  ReconcilerTopology,
} from "@openprose/reactor/internals";

// ---------------------------------------------------------------------------
// Node identities. The two gateways are the entry points (external-driven). The
// roles are first-class responsibilities, each subscribing to ONE masked facet.
// ---------------------------------------------------------------------------

const SIGNALS = "gateway.signals"; // Product Signal Inbox (entry)
const WEAVE = "gateway.weave-config"; // Weave Config (entry; carries the auditor's re-weave)
const LEDGER = "responsibility.signal-ledger";
const VIEWPORT = "responsibility.viewport-policy";
const ANALOGIST = "responsibility.analogist";
const ADVERSARY = "responsibility.adversary";
const BREAKER = "responsibility.constraint-breaker";
const KEEPER = "responsibility.weirdness-keeper";
const OBLIQUE = "responsibility.oblique-ledger";
const MEMO = "responsibility.surprising-bet";
const AUDITOR = "responsibility.novelty-auditor";

// The four roles and the masked facet each one subscribes to on the Viewport
// Policy. THIS is the hidden-context mechanism: each role sees a DIFFERENT slice.
const ROLES = [ANALOGIST, ADVERSARY, BREAKER, KEEPER] as const;
type Role = (typeof ROLES)[number];

const VIEW_FACET: Record<Role, Facet> = {
  [ANALOGIST]: "view:analogist",
  [ADVERSARY]: "view:adversary",
  [BREAKER]: "view:constraint-breaker",
  [KEEPER]: "view:weirdness-keeper",
};

const LABELS: Record<string, string> = {
  [SIGNALS]: "Product Signal Inbox",
  [WEAVE]: "Weave Config",
  [LEDGER]: "Signal Ledger",
  [VIEWPORT]: "Viewport Policy",
  [ANALOGIST]: "Analogist",
  [ADVERSARY]: "Adversary",
  [BREAKER]: "Constraint Breaker",
  [KEEPER]: "Weirdness Keeper",
  [OBLIQUE]: "Oblique Thread Ledger",
  [MEMO]: "Surprising Bet Memo",
  [AUDITOR]: "Novelty Auditor",
};

// ---------------------------------------------------------------------------
// Deterministic fingerprint of a structured sub-value (a masked viewport). A
// masked facet token moves iff the role's projected slice moves.
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
// The cost model. Fresh tokens scale with how much NEW material a render had to
// digest; reused tokens are the prior frame + contract it carried for free. The
// reconciler stamps skipped/failed receipts with zero fresh automatically, so a
// quiet epoch is a flat line and a surprise is a single spike off it.
// ---------------------------------------------------------------------------

const FRESH_PER_UNIT = 160;
const REUSED_FLOOR = 140;

function renderCost(ctx: RenderContext, freshUnits: number, reusedUnits = 0): Cost {
  return {
    provider: "fixture",
    model: "deterministic-fake",
    tokens: {
      fresh: Math.max(1, Math.round(freshUnits * FRESH_PER_UNIT)),
      reused: REUSED_FLOOR + reusedUnits * 40,
    },
    // THE INVARIANT: the cause of the spend IS the wake that drove it. Read it
    // off the context — never hardcode it.
    surprise_cause: ctx.wake.source,
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

// A facet-less producer exposes its whole truth as the atomic facet — the
// canonicalizer maps the artifact's fingerprint onto ATOMIC_FACET (never "*").
const atomicTruth = (fm: WorldModelFiles) => ({
  [ATOMIC_FACET]: fingerprintArtifact(fm),
});

// THE HIDDEN-CONTEXT BOUNDARY. The Viewport Policy re-projects the same anomaly
// truth into ONE INDEPENDENT MASKED FACET PER ROLE. Each role's facet token is
// the fingerprint of ONLY that role's masked slice — so a change that perturbs
// only one role's view moves only that role's facet, and only that role wakes.
const viewportCanon = (fm: WorldModelFiles) => {
  const t = readTruth(fm);
  const views = (t["role_views"] ?? {}) as Record<string, unknown>;
  const out: Record<string, Fingerprint> = { [ATOMIC_FACET]: fingerprintArtifact(fm) };
  for (const role of ROLES) {
    out[VIEW_FACET[role]] = materialFingerprint(views[role] ?? null);
  }
  return out;
};

// ---------------------------------------------------------------------------
// The masking policy: deterministic role-view assignment. Each anomaly is routed
// to exactly ONE role's masked view, keyed by (seed, anomaly index). A different
// seed (a re-weave) re-routes anomalies to different roles — which is how the
// Novelty Auditor's recommended viewport shift, applied as a new Weave Config,
// changes WHO sees WHAT next epoch.
// ---------------------------------------------------------------------------

interface Anomaly {
  readonly id: string;
  readonly note: string;
  readonly weirdness: number;
}

const ROLE_ORDER: readonly Role[] = ROLES;

// Route an anomaly to a role deterministically by a STABLE hash of its id (NOT
// its list position), rotated by the seed. Keying on the id (not the index)
// means appending a new anomaly perturbs ONLY the masked view of the one role it
// routes to — the others' slices are byte-identical, so they stay dark. A new
// seed (a re-weave) rotates EVERY assignment, so the same anomaly can surface in
// a different role's viewport across an epoch boundary.
function assignRole(seed: number, anomalyId: string): Role {
  const h = createHash("sha256").update(anomalyId).digest();
  const base = h.readUInt32BE(0) % ROLE_ORDER.length;
  return ROLE_ORDER[(base + seed) % ROLE_ORDER.length]!;
}

// The masked view a role receives: ONLY the anomalies routed to it, plus its
// hidden-field policy (the weirdness score is masked out for every role EXCEPT
// the Weirdness Keeper — a genuinely different viewport of the same truth). The
// view is a PURE function of (seed, anomalies), so it replays.
function maskedViewFor(
  role: Role,
  seed: number,
  anomalies: readonly Anomaly[],
  hiddenFields: readonly string[],
): { assigned: { id: string; note: string; weirdness?: number }[]; hidden: string[] } {
  const assigned = anomalies
    .filter((a) => assignRole(seed, a.id) === role)
    .map((a) => {
      const slice: { id: string; note: string; weirdness?: number } = {
        id: a.id,
        note: a.note,
      };
      // The Weirdness Keeper always sees the weirdness score; others may have it
      // masked (hidden_fields) — a genuinely different viewport of the same truth.
      if (role === KEEPER || !hiddenFields.includes("weirdness")) {
        slice.weirdness = a.weirdness;
      }
      return slice;
    });
  return { assigned, hidden: [...hiddenFields] };
}

// ---------------------------------------------------------------------------
// Render bodies (pure deterministic fakes; cost scales with material moved).
// ---------------------------------------------------------------------------

type Render = (ctx: RenderContext) => RenderProduct;

interface Deps {
  readonly store: WorldModelStore;
  /** The mutable external signal payload the Product Signal Inbox projects. */
  readonly signal: () => { anomalies: Anomaly[]; epoch: number };
  /** The mutable external Weave Config the operator/auditor sets. */
  readonly weave: () => { seed: number; hidden_fields: string[]; note: string };
}

// The Product Signal Inbox gateway: normalize the external signal stream into the
// raw anomaly bundle the Signal Ledger dedupes.
function signalsRender(deps: Deps): Render {
  return (ctx) => {
    const s = deps.signal();
    return commit({ anomalies: s.anomalies, epoch: s.epoch }, renderCost(ctx, 1, 1));
  };
}

// The Weave Config gateway: the explicit operator/controller config. Its truth is
// where the Novelty Auditor's recommendation lands NEXT epoch (as a new receipt).
function weaveRender(deps: Deps): Render {
  return (ctx) => {
    const w = deps.weave();
    return commit(
      { seed: w.seed, hidden_fields: w.hidden_fields, note: w.note },
      renderCost(ctx, 1, 1),
    );
  };
}

// The Signal Ledger: dedupe the inbox anomalies into a stable, fingerprinted set.
function ledgerRender(deps: Deps): Render {
  return (ctx) => {
    const inbox = readJson<{ anomalies: Anomaly[] }>(deps.store, SIGNALS);
    const seen = new Map<string, Anomaly>();
    for (const a of inbox?.anomalies ?? []) {
      if (!seen.has(a.id)) seen.set(a.id, a);
    }
    const items = [...seen.values()].sort((x, y) => (x.id < y.id ? -1 : 1));
    return commit({ items, item_count: items.length }, renderCost(ctx, Math.max(1, items.length), 1));
  };
}

// The Viewport Policy: read the deduped anomalies + the explicit Weave Config and
// project ONE MASKED VIEW PER ROLE. The canonicalizer exposes one facet per role
// (view:<role>) — the hidden-context boundary. Deterministic seeds make role
// views replayable.
function viewportRender(deps: Deps): Render {
  return (ctx) => {
    const led = readJson<{ items: Anomaly[] }>(deps.store, LEDGER);
    const cfg = readJson<{ seed: number; hidden_fields: string[] }>(deps.store, WEAVE);
    const anomalies = led?.items ?? [];
    const seed = cfg?.seed ?? 0;
    const hidden = cfg?.hidden_fields ?? [];
    const role_views: Record<string, unknown> = {};
    for (const role of ROLES) {
      role_views[role] = maskedViewFor(role, seed, anomalies, hidden);
    }
    return commit(
      { role_views, seed, policy_reason: `deterministic seed ${seed}; hidden ${hidden.join(",") || "(none)"}` },
      renderCost(ctx, Math.max(1, anomalies.length), 2),
    );
  };
}

// A role render: read ONLY its own masked viewport off the Viewport Policy and
// emit its role-specific oblique thread. It NEVER reads the full anomaly bundle —
// it only ever sees the slice the policy masked for it. The four roles share this
// shape but key on a different masked facet, so they wake independently.
function roleRender(deps: Deps, role: Role, lens: string): Render {
  return (ctx) => {
    const vp = readJson<{ role_views: Record<string, { assigned: unknown[] }> }>(deps.store, VIEWPORT);
    const view = vp?.role_views?.[role] ?? { assigned: [] };
    const assigned = (view as { assigned: { id: string; note: string }[] }).assigned ?? [];
    const threads = assigned.map((a) => ({
      anomaly: a.id,
      lens,
      thread: `${lens}: ${a.note}`,
    }));
    return commit(
      { role, lens, threads, thread_count: threads.length },
      renderCost(ctx, Math.max(1, threads.length), 1),
    );
  };
}

// The Oblique Thread Ledger: DIAMOND fan-in from all four roles. Merge their
// threads WITHOUT erasing minority/low-consensus threads (every role's threads
// are preserved). A single woken role re-renders this once (the fan-in apex).
function obliqueRender(deps: Deps): Render {
  return (ctx) => {
    const threads: { role: string; anomaly: string; thread: string }[] = [];
    for (const role of ROLES) {
      const r = readJson<{ threads: { anomaly: string; thread: string }[]; lens: string }>(
        deps.store,
        role,
      );
      for (const t of r?.threads ?? []) {
        threads.push({ role, anomaly: t.anomaly, thread: t.thread });
      }
    }
    threads.sort((a, b) => (`${a.role}:${a.anomaly}` < `${b.role}:${b.anomaly}` ? -1 : 1));
    const preservedMinorities = threads.filter((t) => t.role === KEEPER).map((t) => t.anomaly);
    return commit(
      { threads, thread_count: threads.length, preserved_minorities: preservedMinorities },
      renderCost(ctx, Math.max(1, threads.length), 2),
    );
  };
}

// The Surprising Bet Memo: compose the oblique threads + the signal ledger into a
// single maintained bet + its kill test. Reuse the prior memo when the input
// receipt set is unchanged (the reconciler's memo handles that automatically).
function memoRender(deps: Deps): Render {
  return (ctx) => {
    const ob = readJson<{ threads: { role: string; thread: string }[] }>(deps.store, OBLIQUE);
    const threads = ob?.threads ?? [];
    const lead = threads[0];
    return commit(
      {
        bet: lead ? `Bet derived from ${threads.length} oblique threads, lead: ${lead.thread}` : "no bet yet",
        why_it_might_be_true: threads.slice(0, 2).map((t) => t.thread),
        why_it_might_be_wrong: "strongest falsifier: the anomaly is a measurement artifact",
        kill_test: "ship a 1-week flagged variant to 2% of accounts; watch the target metric",
        thread_count: threads.length,
      },
      renderCost(ctx, Math.max(1, threads.length), 2),
    );
  };
}

// The Novelty Auditor: TERMINAL. Score genericness/convergence over the memo +
// oblique threads and emit a recommended viewport shift. Its recommendation is a
// DIAGNOSTIC output — applying it requires a later EXPLICIT Weave Config input
// (modeled in epoch4 as a fresh external wake), so the mounted graph stays a DAG.
function auditorRender(deps: Deps): Render {
  return (ctx) => {
    const memo = readJson<{ thread_count: number }>(deps.store, MEMO);
    const ob = readJson<{ preserved_minorities: string[] }>(deps.store, OBLIQUE);
    const threadCount = memo?.thread_count ?? 0;
    const preserved = ob?.preserved_minorities ?? [];
    // A cheap deterministic "genericness" proxy: fewer distinct threads ⇒ more
    // generic. The recommendation: shift the seed so a different role gets the
    // contested anomalies next epoch (the re-weave the operator can apply).
    const genericness = threadCount <= 1 ? 0.8 : 0.3;
    return commit(
      {
        genericness_score: genericness,
        convergence_score: preserved.length === 0 ? 0.9 : 0.4,
        lost_threads: preserved.length === 0 ? ["weirdness-keeper minorities"] : [],
        recommended_viewport_shift: { bump_seed: 1, reason: "rotate role viewports to break consensus" },
        reason: "diagnostic only; apply via a new Weave Config receipt next epoch",
      },
      renderCost(ctx, 1, 1),
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
  readonly contractFingerprint: Fingerprint;
}

function buildReconcilerTopology(decls: readonly NodeDecl[]): ReconcilerTopology {
  const contract_fingerprints: Record<string, Fingerprint> = {};
  for (const d of decls) contract_fingerprints[d.id] = d.contractFingerprint;

  const nodes: TopologyNode[] = decls.map((d) => ({
    node: d.id,
    contract_fingerprint: d.contractFingerprint,
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
// The beat map. Committed beside the state-dir, self-written by THIS generator so
// a regeneration is lossless. Frame indices are illustrative scenario markers.
// ---------------------------------------------------------------------------

const BEATS = {
  scenario: "oblique-weave",
  title:
    "A programmable novelty-pressure system. Four masked roles each see a different slice of the same truth; a terminal auditor's recommendation re-weaves who sees what NEXT epoch — DAG intact.",
  beats: [
    {
      name: "cold",
      park: 1,
      from: 0,
      to: 10,
      holdMs: 2800,
      caption: "cold start · both gateways + the ledger + the viewport policy fan one masked view to each of four roles · the whole weave lights once",
    },
    {
      name: "quiet-skip",
      park: 11,
      from: 11,
      to: 11,
      holdMs: 3600,
      caption: "an identical signal re-wake · the signal ledger memo-SKIPS · moved[—] · fresh 0 · nothing downstream wakes",
    },
    {
      name: "surprise-one-role",
      park: 16,
      from: 12,
      to: 16,
      holdMs: 4000,
      caption: "a new founder hunch lands · ONLY the Analogist's masked viewport moves · the three sibling roles stay DARK · the bet re-writes",
    },
    {
      name: "re-weave-next-epoch",
      park: 21,
      from: 17,
      to: 21,
      holdMs: 4200,
      caption: "the auditor's recommended viewport shift arrives as a NEW Weave Config receipt · the seed rotates · the Adversary now sees the contested anomaly · DAG-preserving, no same-epoch cycle",
    },
  ],
};

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

// Per-node contract fingerprints. The internal responsibilities are held fixed
// across the whole run — they re-render ONLY when an upstream INPUT moves (true
// input-driven propagation). The two GATEWAYS carry an epoch-versioned contract
// fingerprint: an external entry node memo-keys on (contract_fingerprint,
// input_fingerprints), and an entry node has NO inputs, so a fresh external
// DELIVERY is modeled by bumping that gateway's contract fingerprint for the epoch
// (exactly the EVALS.md lesson surprise-cost teaches: you cannot drive a surprise
// by re-waking a fixed-contract entry node — it renders once and skips forever; to
// deliver new external truth you MOVE the entry node's memo key). The QUIET epoch
// reuses the SAME gateway contract ⇒ a memo-skip.
const FP: Record<string, Fingerprint> = {
  [LEDGER]: "contract:responsibility.signal-ledger@v1",
  [VIEWPORT]: "contract:responsibility.viewport-policy@v1",
  [ANALOGIST]: "contract:responsibility.analogist@v1",
  [ADVERSARY]: "contract:responsibility.adversary@v1",
  [BREAKER]: "contract:responsibility.constraint-breaker@v1",
  [KEEPER]: "contract:responsibility.weirdness-keeper@v1",
  [OBLIQUE]: "contract:responsibility.oblique-ledger@v1",
  [MEMO]: "contract:responsibility.surprising-bet@v1",
  [AUDITOR]: "contract:responsibility.novelty-auditor@v1",
};

// The per-delivery gateway contract fingerprints (the memo key an entry node moves
// to deliver fresh external truth). The quiet epoch reuses @d1; the surprise bumps
// SIGNALS to @d2; the re-weave bumps WEAVE to @d2.
const SIGNALS_FP_D1: Fingerprint = "contract:gateway.signals@d1";
const SIGNALS_FP_D2: Fingerprint = "contract:gateway.signals@d2";
const WEAVE_FP_D1: Fingerprint = "contract:gateway.weave-config@d1";
const WEAVE_FP_D2: Fingerprint = "contract:gateway.weave-config@d2";

/**
 * Build the deterministic oblique-weave state-dir at `opts.stateDir`. Drives the
 * cold → quiet → surprise → re-weave beat timeline through the REAL
 * `@openprose/reactor` reconciler over the FileSystem store + ledger (NO model
 * key), then writes `compile/topology.json` + `compile/labels.json` + `beats.json`.
 * Re-running with the same path reproduces the bytes.
 */
export function generateObliqueWeaveFixture(opts: GenerateOptions): GenerateResult {
  const { stateDir } = opts;
  if (opts.clean !== false && existsSync(stateDir)) {
    rmSync(stateDir, { recursive: true, force: true });
  }
  mkdirSync(stateDir, { recursive: true });

  const worldModelDir = join(stateDir, "world-models");
  const store = new FileSystemWorldModelStore({ directory: worldModelDir });
  const storage = createFileSystemStorageAdapter({ directory: stateDir });
  const ledger = new FileSystemReceiptLedger({ storage });

  // The mutable external inputs the gateways project. The initial anomaly ids are
  // chosen so that under seed 0 they route to THREE DISTINCT roles (the adversary,
  // the constraint-breaker, the weirdness-keeper) — so the analogist's viewport is
  // empty at cold boot and the surprise epoch can light it ALONE.
  let signal = {
    anomalies: [
      // → adversary @ seed0
      { id: "csv-export", note: "power users export to CSV then re-import elsewhere", weirdness: 0.6 },
      // → constraint-breaker @ seed0
      { id: "a3", note: "a competitor ships a feature nobody asked for", weirdness: 0.7 },
      // → weirdness-keeper @ seed0
      { id: "beta", note: "support tickets quietly ask for a way to do LESS", weirdness: 0.5 },
    ] as Anomaly[],
    epoch: 1,
  };
  let weave = { seed: 0, hidden_fields: ["weirdness"], note: "default weave" };

  const deps: Deps = { store, signal: () => signal, weave: () => weave };

  // Build the per-epoch declarations. The two gateway contract fingerprints are
  // the only things that vary across epochs (a fresh external delivery moves the
  // entry node's memo key); every responsibility's contract is held fixed.
  const decls = (signalsFp: Fingerprint, weaveFp: Fingerprint): NodeDecl[] => [
    {
      id: SIGNALS,
      kind: "gateway",
      requires: [],
      render: signalsRender(deps),
      canonicalizer: atomicTruth,
      contractFingerprint: signalsFp,
    },
    {
      id: WEAVE,
      kind: "gateway",
      requires: [],
      render: weaveRender(deps),
      canonicalizer: atomicTruth,
      contractFingerprint: weaveFp,
    },
    {
      id: LEDGER,
      kind: "responsibility",
      requires: [{ producer: SIGNALS, facet: ATOMIC_FACET }],
      render: ledgerRender(deps),
      canonicalizer: atomicTruth,
      contractFingerprint: FP[LEDGER]!,
    },
    {
      id: VIEWPORT,
      kind: "responsibility",
      // The Viewport Policy fuses the deduped anomalies + the explicit Weave
      // Config, and exposes ONE MASKED FACET PER ROLE.
      requires: [
        { producer: LEDGER, facet: ATOMIC_FACET },
        { producer: WEAVE, facet: ATOMIC_FACET },
      ],
      render: viewportRender(deps),
      canonicalizer: viewportCanon,
      contractFingerprint: FP[VIEWPORT]!,
    },
    // The four roles — each subscribes to ONLY its OWN masked facet (the hidden
    // context boundary). A change to one role's masked view wakes only that role.
    {
      id: ANALOGIST,
      kind: "responsibility",
      requires: [{ producer: VIEWPORT, facet: VIEW_FACET[ANALOGIST] }],
      render: roleRender(deps, ANALOGIST, "analogy"),
      canonicalizer: atomicTruth,
      contractFingerprint: FP[ANALOGIST]!,
    },
    {
      id: ADVERSARY,
      kind: "responsibility",
      requires: [{ producer: VIEWPORT, facet: VIEW_FACET[ADVERSARY] }],
      render: roleRender(deps, ADVERSARY, "inversion"),
      canonicalizer: atomicTruth,
      contractFingerprint: FP[ADVERSARY]!,
    },
    {
      id: BREAKER,
      kind: "responsibility",
      requires: [{ producer: VIEWPORT, facet: VIEW_FACET[BREAKER] }],
      render: roleRender(deps, BREAKER, "constraint-break"),
      canonicalizer: atomicTruth,
      contractFingerprint: FP[BREAKER]!,
    },
    {
      id: KEEPER,
      kind: "responsibility",
      requires: [{ producer: VIEWPORT, facet: VIEW_FACET[KEEPER] }],
      render: roleRender(deps, KEEPER, "preserve-weirdness"),
      canonicalizer: atomicTruth,
      contractFingerprint: FP[KEEPER]!,
    },
    {
      id: OBLIQUE,
      kind: "responsibility",
      // DIAMOND fan-in from all four roles (atomic) — merges without erasing
      // minority threads.
      requires: ROLES.map((r) => ({ producer: r })),
      render: obliqueRender(deps),
      canonicalizer: atomicTruth,
      contractFingerprint: FP[OBLIQUE]!,
    },
    {
      id: MEMO,
      kind: "responsibility",
      requires: [{ producer: OBLIQUE, facet: ATOMIC_FACET }],
      render: memoRender(deps),
      canonicalizer: atomicTruth,
      contractFingerprint: FP[MEMO]!,
    },
    {
      id: AUDITOR,
      kind: "responsibility",
      // TERMINAL: reads the memo + the oblique threads. Its recommendation is a
      // diagnostic output; it has NO edge back to the Viewport Policy (no
      // same-epoch cycle) — the loop closes via a new Weave Config receipt.
      requires: [
        { producer: MEMO, facet: ATOMIC_FACET },
        { producer: OBLIQUE, facet: ATOMIC_FACET },
      ],
      render: auditorRender(deps),
      canonicalizer: atomicTruth,
      contractFingerprint: FP[AUDITOR]!,
    },
  ];

  // Mount the graph for an epoch's pair of gateway contract fingerprints over the
  // SAME store + ledger. Re-mounting with a bumped gateway contract is how a fresh
  // external delivery moves an entry node's memo key (the reconciler re-derives the
  // last receipts from the persisted trail, so only what changed re-renders).
  const mountFor = (signalsFp: Fingerprint, weaveFp: Fingerprint) => {
    const ds = decls(signalsFp, weaveFp);
    const reconcilerTopology = buildReconcilerTopology(ds);
    const mounts: Record<
      string,
      { render: Render; canonicalizer: NodeDecl["canonicalizer"] }
    > = {};
    for (const d of ds) mounts[d.id] = { render: d.render, canonicalizer: d.canonicalizer };
    const dag = mountDag({ topology: reconcilerTopology, mounts, store, ledger });
    return { reconcilerTopology, dag };
  };

  // ======================================================================
  // The scripted beat timeline (cold → quiet → surprise → re-weave) over ONE
  // ledger. The two gateways are independent entry points; an ingest on each
  // delivers an external wake.
  // ======================================================================

  // --- epoch1: COLD. The explicit Weave Config lands first (the standing policy),
  // then the first signal delivery lights the whole weave: signal-ledger →
  // viewport-policy (one masked view per role) → four roles → oblique-ledger →
  // surprising-bet → novelty-auditor.
  const e1 = mountFor(SIGNALS_FP_D1, WEAVE_FP_D1);
  e1.dag.ingest(WEAVE); // the config policy is established (an entry point)
  e1.dag.ingest(SIGNALS); // the first signal delivery cascades the rest of the graph

  // --- epoch2: QUIET. Re-deliver the SAME signal with the SAME gateway contract.
  // The entry node's memo key (contract_fingerprint, ∅ inputs) is a HIT ⇒ the
  // SIGNALS gateway memo-SKIPS ⇒ a skip propagates nothing ⇒ NOTHING downstream
  // wakes. The marquee flat frame: skipped, moved[—], fresh 0.
  e1.dag.ingest(SIGNALS); // -> gateway.signals:skipped (no propagation)

  // --- epoch3: SURPRISE. A new founder hunch lands. Model the fresh delivery by
  // bumping the SIGNALS gateway contract (its memo key MOVES) over the SAME ledger.
  // The new anomaly id ("delta") routes to the ANALOGIST under seed 0, and routing
  // is keyed on the anomaly id (NOT list position), so the THREE existing
  // anomalies' masked slices stay byte-identical ⇒ ONLY the analogist's masked
  // facet moves ⇒ ONLY the Analogist re-renders; the Adversary, Constraint Breaker,
  // and Weirdness Keeper stay DARK. The surprise propagates down the
  // oblique→memo→auditor spine. (Hidden context: a different masked viewport of the
  // same truth — only the role whose slice moved wakes.)
  signal = {
    anomalies: [
      ...signal.anomalies,
      { id: "delta", note: "founder hunch: customers want a 'boring mode'", weirdness: 0.9 },
    ],
    epoch: 3,
  };
  const e3 = mountFor(SIGNALS_FP_D2, WEAVE_FP_D1);
  e3.dag.ingest(SIGNALS); // surprise propagates down the analogist spine

  // --- epoch4: RE-WEAVE. The Novelty Auditor's recommended viewport shift arrives
  // as a NEW EXPLICIT Weave Config delivery — a fresh EXTERNAL wake modeled by
  // bumping the WEAVE gateway contract (NOT a same-epoch cycle: the auditor has no
  // edge back to the viewport). The seed rotates 0 → 1, RE-ROUTING the anomalies to
  // different roles ("delta" moves from the analogist to the ADVERSARY, etc.). The
  // viewport's per-role facets move, the roles that gained/lost an anomaly
  // re-render, and the surprise propagates down to a re-audited memo. The terminal
  // recommendation closed the loop ACROSS the epoch boundary, the mounted DAG intact.
  weave = { seed: 1, hidden_fields: ["weirdness"], note: "re-weave: auditor recommended seed bump" };
  const e4 = mountFor(SIGNALS_FP_D2, WEAVE_FP_D2);
  e4.dag.ingest(WEAVE); // the viewport re-projects under the new seed

  // The committed topology snapshot reflects the FINAL (re-weave epoch) contract
  // fingerprints — the shape a `reactor compile` of the current contract emits.
  const reconcilerTopology = e4.reconcilerTopology;

  // --- Persist the topology snapshot (MANDATORY for replay) ----------------
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
  // The recorder beat map — self-written so a regen is lossless.
  writeFileSync(join(stateDir, "beats.json"), `${JSON.stringify(BEATS, null, 2)}\n`, "utf8");

  const receipts = ledger.all();
  return {
    stateDir,
    receiptsCount: receipts.length,
    nodeCount: reconcilerTopology.topology.nodes.length,
    edgeCount: reconcilerTopology.topology.edges.length,
    facets: [ATOMIC_FACET, ...ROLES.map((r) => VIEW_FACET[r])],
  };
}

// Allow `node generate.js [stateDir]` (and a re-invoke from the package script).
if (require.main === module) {
  const dirArg = process.argv[2];
  const stateDir = dirArg
    ? require("node:path").resolve(dirArg)
    : join(__dirname, "replay");
  const result = generateObliqueWeaveFixture({ stateDir });
  process.stdout.write(
    `wrote oblique-weave fixture → ${result.stateDir}\n` +
      `  receipts: ${result.receiptsCount}\n` +
      `  nodes:    ${result.nodeCount}\n` +
      `  edges:    ${result.edgeCount}\n`,
  );
}
