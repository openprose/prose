// The Basic Unit Suite fixture GENERATOR — the substrate example. It is the
// smallest graph that exercises EVERY Reactor micro-mechanic the larger examples
// stand on: memo skip, facet subscription, diamond single-wake, the
// function/projection boundary, self-continuity, failure containment, and
// deterministic replay (the U00–U12 acceptance cases).
//
// It drives the REAL `@openprose/reactor` reconciler over the FileSystem store +
// ledger with PURE deterministic fake renders (NO model key), then writes the
// full devtools state-dir shape so reactor-devtools can replay it unchanged:
//
//   <state-dir>/receipts.json              (flat append-only ledger trail)
//   <state-dir>/world-models/<hexNodeId>/… (per-node published truth + history)
//   <state-dir>/compile/topology.json      (the flat TopologyWorldModel)
//   <state-dir>/compile/labels.json        (nodeId → friendly label)
//   <state-dir>/beats.json                 (the scripted beat timeline; SELF-WRITTEN
//                                           so a regen is LOSSLESS — never clobbered)
//
// THE GRAPH (the shared mini fixture from basic-unit-suite.md):
//
//   ingress.counter-events  (phantom external source — NOT a topology node)
//        │ (atomic)
//   gateway.counter-events  ── facets: raw_events , counts
//        ├─ counts ──────────▶ responsibility.count-summary
//        │                          │ (atomic)
//        │                     responsibility.alert-state
//        │                          │ (atomic)
//        │                     responsibility.alert-projection   (calls Format Alert
//        │                                                         Copy INTERNALLY; a
//        │                                                         projection node)
//        ├─ raw_events ──────▶ responsibility.raw-event-auditor
//        └─ counts ──────────▶ responsibility.count-trend  (self-driven recheck)
//                                   ╲        ╷        ╱
//   responsibility.executive-snapshot  ◀────┘  (DIAMOND fan-in: alert-state +
//                                                raw-event-audit + count-trend)
//
//   Function: Format Alert Copy is a CALLED HELPER inside alert-projection's
//   render — it is NOT a graph node and NOTHING subscribes to it (U07).
//
// Determinism: every render body is a PURE function of (upstream truth read by
// reference, own prior); cost is a pure function of how much material moved. Same
// generator ⇒ byte-identical state-dir.

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
  type Wake,
} from "@openprose/reactor";
import {
  FileSystemWorldModelStore,
  FileSystemReceiptLedger,
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
} from "@openprose/reactor/internals";

import type { RenderContext, RenderProduct } from "@openprose/reactor";
import type { ReconcilerTopology } from "@openprose/reactor/internals";

// ---------------------------------------------------------------------------
// Node identities. Exported so the test (and any example that imports this
// substrate) names the SAME nodes without restating string literals.
// ---------------------------------------------------------------------------

export const SOURCE = "ingress.counter-events"; // the phantom external feed (NOT a node)
export const GATEWAY = "gateway.counter-events";
export const COUNT_SUMMARY = "responsibility.count-summary";
export const ALERT_STATE = "responsibility.alert-state";
export const ALERT_PROJECTION = "responsibility.alert-projection";
export const RAW_EVENT_AUDITOR = "responsibility.raw-event-auditor";
export const COUNT_TREND = "responsibility.count-trend";
export const EXECUTIVE_SNAPSHOT = "responsibility.executive-snapshot";

// The two gateway facets (U05 facet subscription). `counts` moves when the
// numeric tallies change; `raw_events` moves whenever the accepted event SET
// changes (including metadata-only events excluded from the tallies).
export const COUNTS_FACET: Facet = "counts";
export const RAW_EVENTS_FACET: Facet = "raw_events";

// ---------------------------------------------------------------------------
// Friendly labels for the SPA (nodeId → human label). MANDATORY: present for
// every example (the plan normalizes labels.json onto every fixture).
// ---------------------------------------------------------------------------

const LABELS: Record<string, string> = {
  [SOURCE]: "Counter Events Inbox",
  [GATEWAY]: "Counter Events",
  [COUNT_SUMMARY]: "Count Summary",
  [ALERT_STATE]: "Alert State",
  [ALERT_PROJECTION]: "Alert Projection",
  [RAW_EVENT_AUDITOR]: "Raw Event Auditor",
  [COUNT_TREND]: "Count Trend",
  [EXECUTIVE_SNAPSHOT]: "Executive Snapshot",
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
        `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`,
    );
  return `{${entries.join(",")}}`;
}

// ---------------------------------------------------------------------------
// The cost model. Fresh tokens scale with how much NEW material a render had to
// digest; the reconciler stamps `skipped` receipts with zeroCost automatically
// (fresh:0). `surprise_cause` MUST equal the wake source — the receipt validation
// enforces it, so we read it off the context, NEVER hardcode it.
// ---------------------------------------------------------------------------

const FRESH_PER_UNIT = 120;
const REUSED_FLOOR = 200;

function renderCost(
  ctx: RenderContext,
  freshUnits: number,
  reusedUnits = 1,
): Cost {
  return {
    provider: "fixture",
    model: "deterministic-fake",
    tokens: {
      fresh: Math.max(1, Math.round(freshUnits * FRESH_PER_UNIT)),
      reused: REUSED_FLOOR + reusedUnits * 40,
    },
    surprise_cause: ctx.wake.source,
  };
}

// ---------------------------------------------------------------------------
// The counter-event ledger the generator drives. A "tick" re-publishes the
// inbox; an event with `material:false` is accepted into raw_events but excluded
// from the counts (U05).
// ---------------------------------------------------------------------------

export interface CounterEvent {
  readonly id: string;
  readonly kind: string;
  readonly value: number;
  /** When false, the event is recorded in raw_events but NOT tallied into counts (U05). */
  readonly material?: boolean;
  /** When true, the event is malformed — the auditor flags it; alert-state can be forced to fail. */
  readonly malformed?: boolean;
}

// The mutable accepted-event ledger (dedup by id, U01). Insertion order preserved.
type EventLedger = CounterEvent[];

// Canonical CounterEventLedger truth the gateway commits. `counts` is the tally
// over MATERIAL events only; `raw_events` is the full accepted id set.
function buildLedgerTruth(events: EventLedger): Record<string, unknown> {
  const material = events.filter((e) => e.material !== false && !e.malformed);
  const countsByKind: Record<string, number> = {};
  for (const e of material)
    countsByKind[e.kind] = (countsByKind[e.kind] ?? 0) + 1;
  const total = material.length;
  return {
    // The `counts` facet projects ONLY this slice (numeric tallies).
    counts: { total, by_kind: countsByKind, high_water_mark: total },
    // The `raw_events` facet projects ONLY this slice (the accepted id set + flags).
    raw_events: {
      accepted_event_ids: events.map((e) => e.id),
      duplicate_event_ids: [] as string[],
      malformed_event_ids: events.filter((e) => e.malformed).map((e) => e.id),
    },
    last_seen_at: events.length, // immaterial-ish monotone marker, kept inside both? No — see canon.
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
  return { world_model: files({ "truth.json": jsonFile(world) }), cost };
}

// ---------------------------------------------------------------------------
// Canonicalizers (which facets a node's truth exposes).
// ---------------------------------------------------------------------------

const atomicTruth = (fm: WorldModelFiles) => ({
  [ATOMIC_FACET]: fingerprintArtifact(fm),
});

// THE facet boundary (U05). The gateway re-projects the ledger into TWO
// INDEPENDENT facet tokens: `counts` (the numeric tallies) and `raw_events` (the
// accepted id set). A metadata-only event moves `raw_events` but NOT `counts`, so
// the Count Summary lane stays dark while the Raw Event Auditor lane lights.
const gatewayCanon = (fm: WorldModelFiles) => {
  const t = readTruth(fm);
  return {
    [ATOMIC_FACET]: fingerprintArtifact(fm),
    [COUNTS_FACET]: materialFingerprint(t["counts"] ?? null),
    [RAW_EVENTS_FACET]: materialFingerprint(t["raw_events"] ?? null),
  };
};

// THE projection boundary (U08/U09). A node that exposes a `structured` facet
// (its MATERIAL truth) separate from the cosmetic markdown/html projection. The
// structured facet moves iff the structured truth moves; the projection bytes can
// churn without moving it.
const structuredCanon = (fm: WorldModelFiles) => {
  const t = readTruth(fm);
  return {
    [ATOMIC_FACET]: fingerprintArtifact(fm),
    structured: materialFingerprint(t["structured_summary"] ?? null),
  };
};

// ---------------------------------------------------------------------------
// Render bodies (pure deterministic fakes).
// ---------------------------------------------------------------------------

type Render = (ctx: RenderContext) => RenderProduct;

interface Deps {
  readonly store: WorldModelStore;
}

// The gateway: read the raw inbox, fold into the canonical CounterEventLedger.
function gatewayRender(deps: Deps): Render {
  return (ctx) => {
    const inbox =
      readJson<{ events?: EventLedger }>(deps.store, SOURCE, "inbox.json")
        ?.events ?? [];
    const truth = buildLedgerTruth(inbox);
    const counts = truth["counts"] as { total: number };
    return commit(truth, renderCost(ctx, Math.max(1, counts.total)));
  };
}

// Count Summary: subscribes ONLY the `counts` facet. Tallies → a structured
// summary + a crossing flag.
const THRESHOLD = 3;
function countSummaryRender(deps: Deps): Render {
  return (ctx) => {
    const gw = readJson(deps.store, GATEWAY);
    const counts = (gw?.["counts"] ?? { total: 0, by_kind: {} }) as {
      total: number;
      by_kind: Record<string, number>;
    };
    const crossed = counts.total >= THRESHOLD;
    // U10: a `poison` kind in the tally forces the DOWNSTREAM Alert State render
    // to fail. The summary itself renders cleanly and commits a valid truth; the
    // failure is contained at Alert State.
    const forceFail = (counts.by_kind["poison"] ?? 0) > 0;
    return commit(
      {
        total: counts.total,
        by_kind: counts.by_kind,
        threshold_crossed: crossed,
        force_fail: forceFail,
        explanation: crossed
          ? `total ${counts.total} crossed threshold ${THRESHOLD}`
          : `total ${counts.total} below threshold ${THRESHOLD}`,
      },
      renderCost(ctx, Math.max(1, counts.total)),
    );
  };
}

// Alert State: subscribes Count Summary (atomic). Maps the summary → a status.
// U10: a `forceFail` flag in the summary forces this render to THROW after
// reading — a failure receipt, prior truth stands, no downstream consumes it.
function alertStateRender(deps: Deps): Render {
  return (ctx) => {
    const cs = readJson(deps.store, COUNT_SUMMARY);
    if (cs?.["force_fail"] === true) {
      throw new Error(
        "alert-state: forced render failure after reading CountSummary (U10)",
      );
    }
    const total = (cs?.["total"] ?? 0) as number;
    const crossed = (cs?.["threshold_crossed"] ?? false) as boolean;
    const status = crossed ? "alert" : total > 0 ? "warn" : "quiet";
    return commit(
      { status, threshold: THRESHOLD, evidence_refs: [COUNT_SUMMARY] },
      renderCost(ctx, 1),
    );
  };
}

// Format Alert Copy: the CALLED HELPER (U07). A plain pure function INSIDE the
// projection render. It is NOT a node, NOTHING subscribes to it, and it produces
// no receipt. We log the call into the projection truth so a trace shows the call
// happened inside the render.
function formatAlertCopy(alert: { status: string; threshold: number }): {
  subject: string;
  body: string;
} {
  return {
    subject: `Alert: ${alert.status}`,
    body: `Status is ${alert.status} at threshold ${alert.threshold}.`,
  };
}

// Alert Projection: subscribes Alert State (atomic). Calls Format Alert Copy
// internally, then commits a MATERIAL `structured_summary` PLUS cosmetic
// markdown/html. The structured facet only moves when the structured truth moves
// (U08): a `cosmeticNonce` perturbs ONLY the markdown bytes.
function alertProjectionRender(
  deps: Deps,
  cosmeticNonce: () => number,
): Render {
  return (ctx) => {
    const as = readJson(deps.store, ALERT_STATE);
    const status = (as?.["status"] ?? "quiet") as string;
    const threshold = (as?.["threshold"] ?? THRESHOLD) as number;
    // U07: the function runs as a called helper inside this render.
    const copy = formatAlertCopy({ status, threshold });
    const structured = { status, threshold, subject: copy.subject };
    // U08: the markdown is a cosmetic projection — a wording nonce changes the
    // bytes WITHOUT moving the structured facet.
    const nonce = cosmeticNonce();
    const markdown = `# ${copy.subject}\n\n${copy.body}${nonce > 0 ? `\n\n_revised wording v${nonce}_` : ""}`;
    return commit(
      {
        structured_summary: structured,
        markdown,
        html: `<h1>${copy.subject}</h1><p>${copy.body}</p>`,
        // the called-function result is ephemeral; we record only that it ran.
        called_function: "format-alert-copy",
      },
      renderCost(ctx, 1),
    );
  };
}

// Raw Event Auditor: subscribes ONLY the `raw_events` facet. Audits the accepted
// id set for duplicates/malformed.
function rawEventAuditorRender(deps: Deps): Render {
  return (ctx) => {
    const gw = readJson(deps.store, GATEWAY);
    const raw = (gw?.["raw_events"] ?? {
      accepted_event_ids: [],
      duplicate_event_ids: [],
      malformed_event_ids: [],
    }) as {
      accepted_event_ids: string[];
      duplicate_event_ids: string[];
      malformed_event_ids: string[];
    };
    return commit(
      {
        accepted_event_ids: raw.accepted_event_ids,
        duplicate_event_ids: raw.duplicate_event_ids,
        malformed_events: raw.malformed_event_ids,
      },
      renderCost(ctx, Math.max(1, raw.accepted_event_ids.length)),
    );
  };
}

// Count Trend: subscribes the `counts` facet AND reads its OWN prior truth (U09).
// Self-continuity: it can wake on `self` to revalidate `valid_until`; the recheck
// propagates ONLY if the maintained truth fingerprint moves.
function countTrendRender(deps: Deps): Render {
  return (ctx) => {
    const gw = readJson(deps.store, GATEWAY);
    const counts = (gw?.["counts"] ?? { total: 0 }) as { total: number };
    const prior = readJson(deps.store, COUNT_TREND); // read prior BY REFERENCE
    const previousTotal = (prior?.["current_total"] ?? 0) as number;
    const current = counts.total;
    const direction =
      current > previousTotal
        ? "up"
        : current < previousTotal
          ? "down"
          : "flat";
    // `valid_until` is recomputed deterministically from the material total; a
    // self-tick that finds the same total re-derives the SAME truth (no move).
    return commit(
      {
        current_total: current,
        previous_total:
          ctx.wake.source === "self" ? previousTotal : previousTotal,
        direction,
        valid_until: current, // immaterial-shaped but kept deterministic
      },
      renderCost(ctx, 1),
    );
  };
}

// Executive Snapshot: the DIAMOND apex (U06). Fans in from Alert State,
// Raw Event Auditor, and Count Trend. It renders ONCE per input-fingerprint
// tuple even when ≥2 inbound paths move together.
function executiveSnapshotRender(deps: Deps): Render {
  return (ctx) => {
    const as = readJson(deps.store, ALERT_STATE);
    const audit = readJson(deps.store, RAW_EVENT_AUDITOR);
    const trend = readJson(deps.store, COUNT_TREND);
    return commit(
      {
        status: (as?.["status"] ?? "quiet") as string,
        total: (trend?.["current_total"] ?? 0) as number,
        audit_health:
          ((audit?.["malformed_events"] ?? []) as string[]).length === 0
            ? "clean"
            : "flagged",
        trend: (trend?.["direction"] ?? "flat") as string,
        evidence_refs: [ALERT_STATE, RAW_EVENT_AUDITOR, COUNT_TREND],
      },
      renderCost(ctx, 1),
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
    requires: decl.requires
      .map((r) => `${r.producer}:${r.facet ?? ATOMIC_FACET}`)
      .sort(),
  });
}

function isAcyclic(
  declared: ReadonlySet<string>,
  edges: readonly { subscriber: string; producer: string }[],
): boolean {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!declared.has(e.producer) || !declared.has(e.subscriber)) continue;
    (adj.get(e.producer) ?? adj.set(e.producer, []).get(e.producer)!).push(
      e.subscriber,
    );
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

function buildReconcilerTopology(
  decls: readonly NodeDecl[],
): ReconcilerTopology {
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
  const entry_points = decls
    .filter((d) => d.kind === "gateway")
    .map((d) => d.id);
  const declared = new Set(decls.map((d) => d.id));
  const topology: TopologyWorldModel = {
    nodes,
    edges,
    entry_points,
    acyclic: isAcyclic(declared, edges),
  };
  return { topology, contract_fingerprints };
}

// ---------------------------------------------------------------------------
// The scripted beat timeline. SELF-WRITTEN into beats.json so a regen is lossless
// (a generator must own its beats.json, never clobber a sibling one). Frame
// indices are the receipt ordinals each beat parks on.
// ---------------------------------------------------------------------------

export const BEATS = {
  scenario: "basic-unit-suite",
  title:
    "The substrate: every micro-mechanic in one tiny graph — memo skip, facet subscription, the diamond, the function/projection boundary, self-continuity, failure containment, replay.",
  beats: [
    {
      name: "cold-start",
      park: 9,
      from: 0,
      to: 9,
      holdMs: 2600,
      caption:
        "cold start (U01–U02) · the whole graph lights once · gateway → summary → alert → projection",
    },
    {
      name: "memo-skip",
      park: 11,
      from: 10,
      to: 11,
      holdMs: 2600,
      caption:
        "U03: a byte-identical re-wake · the gateway memo-SKIPS · nothing propagates · fresh 0",
    },
    {
      name: "linear-propagation",
      park: 19,
      from: 12,
      to: 19,
      holdMs: 3000,
      caption:
        "U04: a real new event · the counts lane wakes summary → alert → projection in DAG order",
    },
    {
      name: "facet-subscription",
      park: 23,
      from: 20,
      to: 23,
      holdMs: 3000,
      caption:
        "U05: a metadata-only event · raw_events moves, counts does NOT · the auditor lights, summary stays dark",
    },
    {
      name: "diamond-single-wake",
      park: 33,
      from: 24,
      to: 33,
      holdMs: 3200,
      caption:
        "U06: a material event reaches the snapshot down THREE paths · it renders ONCE for the tuple",
    },
    {
      name: "projection-boundary",
      park: 34,
      from: 34,
      to: 34,
      holdMs: 3000,
      caption:
        "U08: a cosmetic contract revision RE-RENDERS the projection · @atomic truth MOVES but the structured facet does NOT · no subscriber, no downstream wake",
    },
    {
      name: "self-recheck",
      park: 36,
      from: 35,
      to: 36,
      holdMs: 2800,
      caption:
        "U09: the projection then Count Trend self-tick · each re-derives the same truth · a no-op recheck propagates nothing",
    },
    {
      name: "failure-containment",
      park: 44,
      from: 37,
      to: 44,
      holdMs: 3000,
      caption:
        "U10: Alert State render fails RED · a failure receipt · the prior alert truth still stands",
    },
  ],
};

// ---------------------------------------------------------------------------
// The generator.
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
  readonly topology: TopologyWorldModel;
}

/**
 * Build the deterministic Basic Unit Suite state-dir at `opts.stateDir`. Drives
 * the scripted beat timeline through the REAL reconciler over the FileSystem
 * store + ledger, then writes `compile/topology.json` + `compile/labels.json` +
 * `beats.json`. Re-running with the same path reproduces the bytes.
 */
export function generateBasicUnitSuiteFixture(
  opts: GenerateOptions,
): GenerateResult {
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

  // The cosmetic nonce for the projection (U08). It is driven explicitly by the
  // generator so the cosmetic re-render perturbs ONLY the markdown bytes.
  let cosmeticNonce = 0;
  const projectionNonce = () => cosmeticNonce;

  const decls: NodeDecl[] = [
    {
      id: GATEWAY,
      kind: "gateway",
      requires: [{ producer: SOURCE, facet: ATOMIC_FACET }],
      render: gatewayRender(deps),
      canonicalizer: gatewayCanon,
    },
    {
      id: COUNT_SUMMARY,
      kind: "responsibility",
      requires: [{ producer: GATEWAY, facet: COUNTS_FACET }],
      render: countSummaryRender(deps),
      canonicalizer: atomicTruth,
    },
    {
      id: ALERT_STATE,
      kind: "responsibility",
      requires: [{ producer: COUNT_SUMMARY }],
      render: alertStateRender(deps),
      canonicalizer: atomicTruth,
    },
    {
      id: ALERT_PROJECTION,
      kind: "responsibility",
      requires: [{ producer: ALERT_STATE }],
      render: alertProjectionRender(deps, projectionNonce),
      canonicalizer: structuredCanon,
    },
    {
      id: RAW_EVENT_AUDITOR,
      kind: "responsibility",
      requires: [{ producer: GATEWAY, facet: RAW_EVENTS_FACET }],
      render: rawEventAuditorRender(deps),
      canonicalizer: atomicTruth,
    },
    {
      id: COUNT_TREND,
      kind: "responsibility",
      requires: [{ producer: GATEWAY, facet: COUNTS_FACET }],
      render: countTrendRender(deps),
      canonicalizer: atomicTruth,
    },
    {
      id: EXECUTIVE_SNAPSHOT,
      kind: "responsibility",
      // DIAMOND fan-in (atomic) from three upstream nodes.
      requires: [
        { producer: ALERT_STATE },
        { producer: RAW_EVENT_AUDITOR },
        { producer: COUNT_TREND },
      ],
      render: executiveSnapshotRender(deps),
      canonicalizer: atomicTruth,
    },
  ];

  const reconcilerTopology = buildReconcilerTopology(decls);
  const mounts: Record<
    string,
    { render: Render; canonicalizer: NodeDecl["canonicalizer"] }
  > = {};
  for (const d of decls)
    mounts[d.id] = { render: d.render, canonicalizer: d.canonicalizer };

  const dag = mountDag({ topology: reconcilerTopology, mounts, store, ledger });

  // A SECOND mount of the SAME graph with ONE node's contract_fingerprint bumped.
  // This models a cosmetic CONTRACT revision (e.g. a re-worded projection prompt):
  // the legitimate memo-key move that forces a render even though no upstream input
  // moved. Used by the U08 projection-boundary beat below to make the projection
  // genuinely RE-RENDER new markdown on disk while its `structured` facet stays flat.
  const remountWithBumpedContract = (nodeId: string, revision: string) => {
    const topology: TopologyWorldModel = {
      ...reconcilerTopology.topology,
      nodes: reconcilerTopology.topology.nodes.map((n) =>
        n.node === nodeId
          ? {
              ...n,
              contract_fingerprint: `${n.contract_fingerprint}+rev:${revision}`,
            }
          : n,
      ),
    };
    const contract_fingerprints: Record<string, Fingerprint> = {
      ...reconcilerTopology.contract_fingerprints,
      [nodeId]: `${reconcilerTopology.contract_fingerprints[nodeId]!}+rev:${revision}`,
    };
    return mountDag({
      topology: { topology, contract_fingerprints },
      mounts,
      store,
      ledger,
    });
  };

  // The mutable accepted-event ledger the generator drives.
  const events: EventLedger = [];

  // Re-publish the inbox and wake the gateway. When `events` is byte-identical to
  // the prior publish, the gateway memo-SKIPS and the whole graph below it skips
  // (the quiet re-wake).
  const publishAndWake = (): void => {
    const fm = files({ "inbox.json": jsonFile({ events }) });
    const commitRes = store.commitPublished(SOURCE, fm, (f) => ({
      [ATOMIC_FACET]: fingerprintArtifact(f),
    }));
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

  // Deliver one accepted event (dedup by id — U01: replaying an id is a no-op).
  const deliver = (event: CounterEvent): void => {
    if (!events.some((e) => e.id === event.id)) events.push(event);
    publishAndWake();
  };

  // ======================================================================
  // The scripted beat timeline.
  // ======================================================================

  // --- Beat: COLD START (U01/U02). One material event seeds the graph; every
  // node renders once — the full cascade lights.
  deliver({ id: "e1", kind: "alpha", value: 1 });

  // --- Beat: MEMO SKIP (U03). A byte-identical re-wake: the inbox is unchanged,
  // so the gateway memo-skips and nothing downstream wakes. Fresh stays flat.
  publishAndWake();

  // --- Beat: LINEAR PROPAGATION (U04). A second material event of the same kind.
  // `counts` moves → Count Summary wakes → Alert State → Alert Projection, in DAG
  // order; Count Trend wakes too (it reads counts). One render per node.
  deliver({ id: "e2", kind: "alpha", value: 1 });

  // --- Beat: FACET SUBSCRIPTION (U05). A metadata-only (immaterial) event: it is
  // ACCEPTED into raw_events but EXCLUDED from counts. `raw_events` moves; `counts`
  // does NOT. The Raw Event Auditor wakes; Count Summary does NOT.
  deliver({ id: "m1", kind: "meta", value: 0, material: false });

  // --- Beat: DIAMOND SINGLE-WAKE (U06). A material event that pushes the total to
  // the threshold: `counts` moves → Count Summary + Count Trend wake, Alert State
  // moves (status → alert), Raw Event Auditor wakes (the id set moved). All three
  // diamond inputs to Executive Snapshot move in the same fixpoint → the snapshot
  // renders ONCE for the final input-fingerprint tuple, not once per inbound edge.
  deliver({ id: "e3", kind: "beta", value: 1 });

  // --- Beat: PROJECTION BOUNDARY (U08). A cosmetic CONTRACT revision: the
  // projection's wording prompt is re-worded (its contract_fingerprint moves) and
  // the generator bumps the cosmetic wording nonce. Re-mounting with the bumped
  // contract_fingerprint is the legitimate memo-key move, so the projection
  // genuinely RE-RENDERS on disk: its markdown (and thus its `@atomic` truth) moves,
  // but its `structured` facet token is re-derived from the SAME `structured_summary`
  // and stays byte-identical. The projection has no subscribers, so this material
  // truth move wakes NOTHING downstream — the cosmetic churn is contained. This is
  // the headline U08 frame, now visible in the committed receipts.json, not just in
  // the in-process test.
  cosmeticNonce = 1;
  const projectionRevisedDag = remountWithBumpedContract(
    ALERT_PROJECTION,
    "reworded-copy-v2",
  );
  projectionRevisedDag.ingest(ALERT_PROJECTION);

  // --- Beat: PROJECTION SELF-RECHECK (U08/U09 sibling). The projection self-ticks
  // on the SAME (revised) contract: it re-derives byte-identical truth, so the self
  // recheck MEMO-SKIPS — a quiet self-recheck of the projection that propagates
  // nothing. (The structured-facet-does-not-move-its-subscriber case is also proved
  // exhaustively against the live reconciler in the example's test.)
  projectionRevisedDag.tick(ALERT_PROJECTION); // memo-skips: byte-identical re-derivation

  // --- Beat: SELF-DRIVEN RECHECK (U09). Count Trend self-ticks: it re-derives its
  // truth from the same `counts`. The truth is byte-identical ⇒ a no-op recheck
  // that propagates nothing (no Executive Snapshot wake).
  dag.tick(COUNT_TREND);

  // --- Beat: FAILURE CONTAINMENT (U10). A `poison` event drives the counts up;
  // Count Summary renders cleanly carrying `force_fail:true`; Alert State wakes,
  // reads the summary, and THROWS. A `failed` receipt is signed; the prior Alert
  // State truth remains the active world-model; the Executive Snapshot does NOT
  // consume a partial failed output (Alert State produced nothing new).
  deliver({ id: "poison", kind: "poison", value: 1 });

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

  // --- Persist the scripted beat timeline (SELF-WRITTEN; never clobbered) ----
  writeFileSync(
    join(stateDir, "beats.json"),
    `${JSON.stringify(BEATS, null, 2)}\n`,
    "utf8",
  );

  const receipts = ledger.all();
  return {
    stateDir,
    receiptsCount: receipts.length,
    nodeCount: reconcilerTopology.topology.nodes.length,
    edgeCount: reconcilerTopology.topology.edges.length,
    facets: [COUNTS_FACET, RAW_EVENTS_FACET, "structured" as Facet],
    topology: reconcilerTopology.topology,
  };
}
