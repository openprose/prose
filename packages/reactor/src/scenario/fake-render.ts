// The Counter mini-fixture — deterministic node bodies for the basic unit suite
// (tests/basic-unit-suite.md "Shared Mini Fixture"; TEST_HARNESS_PROPOSAL.md §4).
//
// One small graph exercises every mechanic the suite cares about: a gateway, two
// facets (raw_events / counts), linear propagation, an internal function call
// (Format Alert Copy, U07), a projection boundary (Alert Projection, U08), a
// self-driven node (Count Trend, U09), and a diamond fan-in (Executive Snapshot,
// U06). Every body is a PURE deterministic function of (upstream truth read by
// reference, own prior) — no clock, no randomness — so renders are reproducible
// and replay (U12) falls out for free.
//
//   Counter Events (gateway)  facets: raw_events, counts
//      ├─counts─────► Count Summary ─► Alert State ─► Alert Projection ─(calls)─► Format Alert Copy (fn)
//      ├─raw_events─► Raw Event Auditor
//      └─counts─────► Count Trend
//                         │
//      Alert State ───────┼───────────┐
//      Raw Event Audit ───┼─► Executive Snapshot  (diamond fan-in)
//      Count Trend ───────┘

import { ATOMIC_FACET, type Facet } from "../shapes";
import {
  fingerprintArtifact,
  files,
  jsonFile,
  readTextFile,
  InMemoryWorldModelStore,
  type Canonicalizer,
  type WorldModelFiles,
  type WorldModelStore,
} from "../world-model";
import { zeroCost, type RenderContext } from "../sdk/render-atom";
import { type MountedRender } from "../sdk/mounted-dag";
import {
  buildScenario,
  injectExternalReceipt,
  materialFingerprint,
  readJson,
  type NodeDecl,
  type ReconcileResult,
  type Scenario,
} from "./fixture";

// ---------------------------------------------------------------------------
// Identities + facets
// ---------------------------------------------------------------------------

export const SOURCE = "ingress.counter-inbox"; // the system's edge (phantom)
export const GATEWAY = "gateway.counter-events";
export const COUNT_SUMMARY = "responsibility.count-summary";
export const ALERT_STATE = "responsibility.alert-state";
export const ALERT_PROJECTION = "responsibility.alert-projection";
export const RAW_EVENT_AUDITOR = "responsibility.raw-event-auditor";
export const COUNT_TREND = "responsibility.count-trend";
export const EXECUTIVE_SNAPSHOT = "responsibility.executive-snapshot";

/** Format Alert Copy is a FUNCTION, never a node (U07). Named only for asserts. */
export const FORMAT_ALERT_COPY = "function.format-alert-copy";

export const INBOX: Facet = "inbox";
export const RAW_EVENTS: Facet = "raw_events";
export const COUNTS: Facet = "counts";
export const STRUCTURED: Facet = "structured";

// ---------------------------------------------------------------------------
// The external event + the harness deps the fake renders close over
// ---------------------------------------------------------------------------

export interface CounterEvent {
  readonly id: string;
  readonly kind: string;
  readonly value: number;
  /** Metadata-only evidence: accepted into raw_events but EXCLUDED from counts (U05). */
  readonly meta?: boolean;
}

export interface CounterDeps {
  readonly store: WorldModelStore;
  /** Raw external arrivals, in order (the gateway dedups by id). */
  readonly inbox: CounterEvent[];
  /** Per-node render invocation counts — proves memo skips never call a render. */
  readonly renders: Record<string, number>;
  /** Flip to force Alert State to throw mid-render (U10). */
  failAlertState: boolean;
  /** Cosmetic projection style — changes markdown without moving structured truth (U08). */
  markdownHeading: "h1" | "h2";
}

function freshDeps(store: WorldModelStore): CounterDeps {
  return {
    store,
    inbox: [],
    renders: {},
    failAlertState: false,
    markdownHeading: "h1",
  };
}

function tick(deps: CounterDeps, node: string): void {
  deps.renders[node] = (deps.renders[node] ?? 0) + 1;
}

// ---------------------------------------------------------------------------
// The function boundary — called INSIDE Alert Projection, never a node (U07)
// ---------------------------------------------------------------------------

export interface AlertCopy {
  readonly subject: string;
  readonly body: string;
}

/** A plain helper. It runs inside a render and returns ephemeral data only. */
export function formatAlertCopy(alert: {
  status?: string;
  observed_total?: number;
}): AlertCopy {
  const status = alert.status ?? "quiet";
  const total = alert.observed_total ?? 0;
  return {
    subject: `Alert: ${status.toUpperCase()}`,
    body: `Status is ${status} with ${total} counted events.`,
  };
}

// ---------------------------------------------------------------------------
// Canonicalizers
// ---------------------------------------------------------------------------

/** The whole-truth (`@atomic`) canonicalizer — any byte change moves the token. */
const atomicTruth: Canonicalizer = (fm) => ({
  [ATOMIC_FACET]: fingerprintArtifact(fm),
});

function readTruth(fm: WorldModelFiles): Record<string, unknown> {
  const bytes = fm["truth.json"];
  return bytes === undefined
    ? {}
    : (JSON.parse(readTextFile(bytes)) as Record<string, unknown>);
}

/** Gateway: independent `raw_events` and `counts` facets over its ledger (U05). */
const gatewayCanon: Canonicalizer = (fm) => {
  const t = readTruth(fm);
  return {
    [ATOMIC_FACET]: fingerprintArtifact(fm),
    [RAW_EVENTS]: materialFingerprint(t["events"] ?? []),
    [COUNTS]: materialFingerprint(t["counts_by_kind"] ?? {}),
  };
};

/** Ingress: the raw inbox is the single `inbox` facet. */
const ingressCanon: Canonicalizer = (fm) => {
  const bytes = fm["inbox.json"];
  const inbox = bytes === undefined ? [] : JSON.parse(readTextFile(bytes));
  return {
    [ATOMIC_FACET]: fingerprintArtifact(fm),
    [INBOX]: materialFingerprint(inbox),
  };
};

/**
 * Alert Projection: `structured_summary` is MATERIAL; `markdown`/`html` are
 * derived projections EXCLUDED from the structured facet. Cosmetic markdown churn
 * moves `@atomic` (the bytes changed) but NOT `structured` (U08), so a downstream
 * subscriber to the structured facet does not wake.
 */
export const projectionCanon: Canonicalizer = (fm) => {
  const t = readTruth(fm);
  return {
    [ATOMIC_FACET]: fingerprintArtifact(fm),
    [STRUCTURED]: materialFingerprint(t["structured_summary"] ?? {}),
  };
};

// ---------------------------------------------------------------------------
// The render bodies (factories closing over deps)
// ---------------------------------------------------------------------------

function dedupById(events: readonly CounterEvent[]): CounterEvent[] {
  const seen = new Set<string>();
  const out: CounterEvent[] = [];
  for (const e of events) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    out.push(e);
  }
  return out;
}

function commit(truth: unknown, ctx: RenderContext) {
  return {
    world_model: files({ "truth.json": jsonFile(truth) }),
    cost: zeroCost(ctx.wake.source),
  };
}

function gatewayRender(deps: CounterDeps): MountedRender {
  return (ctx) => {
    tick(deps, GATEWAY);
    const inbox = (readJson<CounterEvent[]>(deps.store, SOURCE, "inbox.json") ??
      []) as CounterEvent[];
    const events = dedupById(inbox); // gateway dedups by id (U01)
    const counts_by_kind: Record<string, number> = {};
    for (const e of events) {
      if (e.meta === true) continue; // metadata-only ⇒ excluded from counts (U05)
      counts_by_kind[e.kind] = (counts_by_kind[e.kind] ?? 0) + 1;
    }
    return commit(
      {
        events,
        counts_by_kind,
        high_water_mark: events.length,
        last_seen_at: events.length,
      },
      ctx,
    );
  };
}

function countSummaryRender(deps: CounterDeps): MountedRender {
  return (ctx) => {
    tick(deps, COUNT_SUMMARY);
    const ledger = readJson(deps.store, GATEWAY);
    const counts = (ledger?.["counts_by_kind"] ?? {}) as Record<string, number>;
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return commit(
      {
        total,
        by_kind: counts,
        threshold_crossed: total >= 3,
        explanation: `total ${total} across ${Object.keys(counts).length} kind(s)`,
      },
      ctx,
    );
  };
}

function alertStateRender(deps: CounterDeps): MountedRender {
  return (ctx) => {
    tick(deps, ALERT_STATE);
    const summary = readJson(deps.store, COUNT_SUMMARY);
    const total = (summary?.["total"] ?? 0) as number;
    if (deps.failAlertState) {
      throw new Error("forced Alert State failure"); // U10
    }
    const status = total >= 5 ? "alert" : total >= 3 ? "warn" : "quiet";
    return commit(
      {
        status,
        threshold: 3,
        observed_total: total,
        evidence_refs: [`count-summary@total=${total}`],
      },
      ctx,
    );
  };
}

function alertProjectionRender(deps: CounterDeps): MountedRender {
  return (ctx) => {
    tick(deps, ALERT_PROJECTION);
    const alert = readJson(deps.store, ALERT_STATE) ?? {};
    const copy = formatAlertCopy(alert as { status?: string; observed_total?: number }); // U07: called inside
    const heading = deps.markdownHeading === "h1" ? "#" : "##";
    const structured_summary = {
      status: (alert as Record<string, unknown>)["status"] ?? "quiet",
      total: (alert as Record<string, unknown>)["observed_total"] ?? 0,
    };
    return commit(
      {
        structured_summary,
        markdown: `${heading} ${copy.subject}\n\n${copy.body}`,
        html: `<h1>${copy.subject}</h1><p>${copy.body}</p>`,
        projection_hash: materialFingerprint(structured_summary),
      },
      ctx,
    );
  };
}

function rawEventAuditorRender(deps: CounterDeps): MountedRender {
  return (ctx) => {
    tick(deps, RAW_EVENT_AUDITOR);
    const ledger = readJson(deps.store, GATEWAY);
    const events = (ledger?.["events"] ?? []) as CounterEvent[];
    const accepted = events.map((e) => e.id);
    const malformed = events
      .filter((e) => e.id === undefined || e.value === undefined)
      .map((e) => e.id);
    return commit(
      {
        duplicate_event_ids: [], // the gateway already deduped
        malformed_events: malformed,
        accepted_event_ids: accepted,
      },
      ctx,
    );
  };
}

function countTrendRender(deps: CounterDeps): MountedRender {
  return (ctx) => {
    tick(deps, COUNT_TREND);
    const ledger = readJson(deps.store, GATEWAY);
    const counts = (ledger?.["counts_by_kind"] ?? {}) as Record<string, number>;
    const current_total = Object.values(counts).reduce((a, b) => a + b, 0);
    const prior = readJson(deps.store, COUNT_TREND);
    const previous_total = (prior?.["current_total"] ?? 0) as number;
    const direction =
      current_total > previous_total
        ? "up"
        : current_total < previous_total
          ? "down"
          : "flat";
    return commit(
      {
        current_total,
        previous_total,
        direction,
        valid_until: current_total, // deterministic, not wall-clock (U09 hook)
      },
      ctx,
    );
  };
}

function executiveSnapshotRender(deps: CounterDeps): MountedRender {
  return (ctx) => {
    tick(deps, EXECUTIVE_SNAPSHOT);
    const alert = readJson(deps.store, ALERT_STATE) ?? {};
    const audit = readJson(deps.store, RAW_EVENT_AUDITOR) ?? {};
    const trend = readJson(deps.store, COUNT_TREND) ?? {};
    const malformed = (audit as Record<string, unknown>)["malformed_events"];
    return commit(
      {
        status: (alert as Record<string, unknown>)["status"] ?? "quiet",
        total: (trend as Record<string, unknown>)["current_total"] ?? 0,
        audit_health:
          Array.isArray(malformed) && malformed.length === 0 ? "ok" : "degraded",
        trend: (trend as Record<string, unknown>)["direction"] ?? "flat",
        evidence_refs: [ALERT_STATE, RAW_EVENT_AUDITOR, COUNT_TREND],
      },
      ctx,
    );
  };
}

// ---------------------------------------------------------------------------
// The fixture + driver
// ---------------------------------------------------------------------------

export interface CounterScenario extends Scenario {
  readonly deps: CounterDeps;
}

/** Build the Counter mini-fixture mounted over the real reconciler. */
export function counterScenario(): CounterScenario {
  // The store the fake renders read upstream truth from BY REFERENCE.
  // `buildScenario` mounts the DAG over this SAME store (threaded via opts.store)
  // so the renders and the reconciler share one world-model substrate.
  const realStore = new InMemoryWorldModelStore();
  const deps = freshDeps(realStore);

  const decls: NodeDecl[] = [
    {
      id: GATEWAY,
      kind: "gateway",
      name: "Counter Events",
      requires: [{ producer: SOURCE, facet: INBOX }],
      maintains: ["raw_events", "counts"],
      continuity: "external",
      source: "Gateway: Counter Events\nMaintains: CounterEventLedger\nContinuity: external",
      render: gatewayRender(deps),
      canonicalizer: gatewayCanon,
    },
    {
      id: COUNT_SUMMARY,
      kind: "responsibility",
      name: "Count Summary",
      requires: [{ producer: GATEWAY, facet: COUNTS }],
      maintains: ["count_summary"],
      continuity: "input-driven",
      render: countSummaryRender(deps),
      canonicalizer: atomicTruth,
    },
    {
      id: ALERT_STATE,
      kind: "responsibility",
      name: "Alert State",
      requires: [{ producer: COUNT_SUMMARY }],
      maintains: ["alert_state"],
      continuity: "input-driven",
      render: alertStateRender(deps),
      canonicalizer: atomicTruth,
    },
    {
      id: ALERT_PROJECTION,
      kind: "responsibility",
      name: "Alert Projection",
      requires: [{ producer: ALERT_STATE }],
      maintains: ["structured", "markdown", "html"],
      continuity: "input-driven",
      render: alertProjectionRender(deps),
      canonicalizer: projectionCanon,
    },
    {
      id: RAW_EVENT_AUDITOR,
      kind: "responsibility",
      name: "Raw Event Auditor",
      requires: [{ producer: GATEWAY, facet: RAW_EVENTS }],
      maintains: ["raw_event_audit"],
      continuity: "input-driven",
      render: rawEventAuditorRender(deps),
      canonicalizer: atomicTruth,
    },
    {
      id: COUNT_TREND,
      kind: "responsibility",
      name: "Count Trend",
      requires: [{ producer: GATEWAY, facet: COUNTS }],
      maintains: ["count_trend"],
      continuity: "input-driven-plus-self",
      render: countTrendRender(deps),
      canonicalizer: atomicTruth,
    },
    {
      id: EXECUTIVE_SNAPSHOT,
      kind: "responsibility",
      name: "Executive Snapshot",
      requires: [
        { producer: ALERT_STATE },
        { producer: RAW_EVENT_AUDITOR },
        { producer: COUNT_TREND },
      ],
      maintains: ["executive_snapshot"],
      continuity: "input-driven",
      render: executiveSnapshotRender(deps),
      canonicalizer: atomicTruth,
    },
  ];

  const scn = buildScenario(decls, { store: realStore });
  return { ...scn, deps };
}

/**
 * Deliver one external event and drain to quiescence. Appends the event to the
 * raw inbox, injects the ingress receipt (moving the gateway's input), then wakes
 * the gateway and lets propagation flow. Returns the per-node drain results.
 */
export function deliverEvent(
  scn: CounterScenario,
  event: CounterEvent,
): readonly ReconcileResult[] {
  scn.deps.inbox.push(event);
  injectExternalReceipt(
    scn,
    SOURCE,
    files({ "inbox.json": jsonFile(scn.deps.inbox) }),
    ingressCanon,
  );
  return scn.dag.ingest(GATEWAY);
}
