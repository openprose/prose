// IT-1 — Basic Unit Suite, LIVE (the Counter mini-graph driven by real renders).
//
// The offline sibling (`basic-unit-suite.test.ts`) asserts the run-loop MECHANICS
// (U00–U12) over the Counter fixture with DETERMINISTIC FAKE renders — zero model
// calls, and it is the green bar that gates the commit. THIS file is the key-gated
// LIVE smoke: it boots the SAME ~7-node topology, but swaps every fake render for
// the live `createAgentRender` adapter (real google/gemini-3.5-flash @ temp 0),
// to kick the tires on the canonical shapes end to end with a real model:
//
//   Counter Events (gateway; facets raw_events + counts)
//      ├─counts─────► Count Summary ─► Alert State ─► Alert Projection
//      ├─raw_events─► Raw Event Auditor
//      └─counts─────► Count Trend (self-recheck)
//   Executive Snapshot ⟵ {Alert State, Raw Event Auditor, Count Trend}  (diamond fan-in)
//
// The headline (INTEGRATION-TESTS-PLAN.md §3 IT-1 / basic-unit-suite.md):
//   (a) the gateway COMMITS a fingerprinted world-model carrying BOTH facets;
//   (b) Count Summary AND Count Trend COMMIT (the `counts` facet propagated);
//   (c) Executive Snapshot COMMITS exactly ONCE for its fan-in input tuple (the
//       diamond reconverges to a single render, not one-per-inbound-edge);
//   (d) a NO-CHANGE re-run (re-wake every node with the SAME inbox) SKIPS every
//       node with ZERO model calls (memo-skip, live).
//
// Wiring (the GROUND BRIEF's preferred path): reuse the scenario topology +
// hand-authored DETERMINISTIC canonicalizers (the facet tokens are load-bearing
// for propagation — gateway mounts a `raw_events`+`counts` canonicalizer, NOT the
// atomic one), and inject the LIVE render at the mount site via `asyncMounts` +
// `dag.ingestAsync`. No parallel harness. The render seam (`AsyncMountedRender`) is
// the composition point; the reconciler cannot tell a live render from a fake one.
//
// Gated `{ skip: hasOpenRouterKey() ? false : "…" }` exactly like every other live
// test, so a keyless run reports a passing (skipped-body) subtest and never touches
// the network — the offline gate stays green and is unaffected by this file.

import { equal, notEqual, ok } from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  ATOMIC_FACET,
  EMPTY_SEMANTIC_DIFF,
  createNullSignature,
  type Facet, type Fingerprint, asFacet, asFingerprint, asNodeId} from "../../shapes";
import {
  fingerprintArtifact,
  files,
  jsonFile,
  readTextFile,
  FileSystemWorldModelStore,
  type Canonicalizer,
  type WorldModelFiles,
  type WorldModelStore,
} from "../../world-model";
import { mountDag, type AsyncMountedRender } from "../../sdk/mounted-dag";
import { zeroCost, type RenderContext } from "../../sdk/render-atom";
import {
  createAgentRender,
  hasOpenRouterKey,
  createOpenRouterProvider,
} from "../../adapters/agent-render";
import type { CompiledContractView } from "../../adapters/agent-render/instructions";
import { materialFingerprint } from "../fixture";
import {
  COUNTS,
  RAW_EVENTS,
  STRUCTURED,
} from "../fake-render";
import {
  countDisposition,
  dispositionOf,
  lastReceipt,
  woke,
} from "../trace";
import type { ReconcilerTopology } from "../../reactor";

// ---------------------------------------------------------------------------
// Identities (mirror fake-render's, but a self-contained live graph)
// ---------------------------------------------------------------------------

const SOURCE = "ingress.counter-inbox";
const GATEWAY = "gateway.counter-events";
const COUNT_SUMMARY = "responsibility.count-summary";
const ALERT_STATE = "responsibility.alert-state";
const ALERT_PROJECTION = "responsibility.alert-projection";
const RAW_EVENT_AUDITOR = "responsibility.raw-event-auditor";
const COUNT_TREND = "responsibility.count-trend";
const EXECUTIVE_SNAPSHOT = "responsibility.executive-snapshot";

const INBOX = asFacet("inbox");

const TRUTH = "truth.json";
const INBOX_FILE = "inbox.json";

interface CounterEvent {
  readonly id: string;
  readonly kind: string;
  readonly value: number;
}

// ---------------------------------------------------------------------------
// Deterministic facet-carrying canonicalizers (the load-bearing propagation
// tokens — same facet semantics as the offline fixture; only the RENDER is live).
// ---------------------------------------------------------------------------

function readTruth(fm: WorldModelFiles): Record<string, unknown> {
  const bytes = fm[TRUTH];
  return bytes === undefined
    ? {}
    : (JSON.parse(readTextFile(bytes)) as Record<string, unknown>);
}

/** Gateway: independent `raw_events` and `counts` facets over its ledger truth. */
const gatewayCanon: Canonicalizer = (fm) => {
  const t = readTruth(fm);
  return {
    [ATOMIC_FACET]: asFingerprint(fingerprintArtifact(fm)),
    [RAW_EVENTS]: asFingerprint(materialFingerprint(t["events"] ?? [])),
    [COUNTS]: asFingerprint(materialFingerprint(t["counts_by_kind"] ?? {})),
  };
};

/** Ingress (phantom source): the raw inbox is the single `inbox` facet. */
const ingressCanon: Canonicalizer = (fm) => {
  const bytes = fm[INBOX_FILE];
  const inbox = bytes === undefined ? [] : JSON.parse(readTextFile(bytes));
  return {
    [ATOMIC_FACET]: asFingerprint(fingerprintArtifact(fm)),
    [INBOX]: asFingerprint(materialFingerprint(inbox)),
  };
};

/** Projection: structured truth is material; markdown/html are excluded. */
const projectionCanon: Canonicalizer = (fm) => {
  const t = readTruth(fm);
  return {
    [ATOMIC_FACET]: asFingerprint(fingerprintArtifact(fm)),
    [STRUCTURED]: asFingerprint(materialFingerprint(t["structured_summary"] ?? {})),
  };
};

/** Whole-truth canonicalizer — any byte change moves the @atomic token. */
const atomicTruth: Canonicalizer = (fm) => ({
  [ATOMIC_FACET]: asFingerprint(fingerprintArtifact(fm)),
});

// ---------------------------------------------------------------------------
// The live contract views: each node's `### Maintains` + the EXACT file shape so
// the deterministic canonicalizers above find the tokens they project. The model
// reads upstream truth BY REFERENCE via wm_list_upstream / wm_read_upstream.
// ---------------------------------------------------------------------------

function liveContractFor(node: string): CompiledContractView {
  switch (node) {
    case GATEWAY:
      return {
        name: "Counter Events",
        maintains: [
          "`raw_events`: the accepted event ledger.",
          "`counts`: per-kind counts.",
        ],
        requires: ["the raw counter inbox"],
        continuity: "External: a gateway turns each arrival into a receipt.",
        execution:
          `Read your inbox BY REFERENCE: call \`wm_list_upstream\` to find your ` +
          `upstream producer, then \`wm_read_upstream\` with that producer and path ` +
          `\`${INBOX_FILE}\` to read a JSON array of events (each {id, kind, value}). ` +
          `De-duplicate the events by \`id\`. Then write the file \`${TRUTH}\` to ` +
          `your workspace, valid JSON of EXACTLY this shape: ` +
          `{"events": [ {"id": string, "kind": string, "value": number} ], ` +
          `"counts_by_kind": { <kind>: <integer count of events of that kind> }, ` +
          `"high_water_mark": <number of events>, "last_seen_at": <number of events>}. ` +
          `The \`events\` array is the de-duplicated input; \`counts_by_kind\` counts ` +
          `events per \`kind\`. Then report status "done".`,
      };
    case COUNT_SUMMARY:
      return {
        name: "Count Summary",
        maintains: ["`count_summary`: total + by_kind counts."],
        requires: ["the gateway's counts facet"],
        continuity: "Input-driven.",
        execution:
          `Read your upstream producer BY REFERENCE: \`wm_list_upstream\` then ` +
          `\`wm_read_upstream\` with that producer and path \`${TRUTH}\`. Read its ` +
          `\`counts_by_kind\` object. Then write \`${TRUTH}\` to your workspace, ` +
          `valid JSON: {"total": <sum of all the counts>, "by_kind": <the ` +
          `counts_by_kind object you read>, "threshold_crossed": <true iff total ` +
          `>= 3>, "explanation": <one short sentence>}. Then report status "done".`,
      };
    case ALERT_STATE:
      return {
        name: "Alert State",
        maintains: ["`alert_state`: status + observed total."],
        requires: ["Count Summary"],
        continuity: "Input-driven.",
        execution:
          `Read your upstream producer BY REFERENCE: \`wm_list_upstream\` then ` +
          `\`wm_read_upstream\` with that producer and path \`${TRUTH}\`. Read its ` +
          `\`total\`. Then write \`${TRUTH}\` to your workspace, valid JSON: ` +
          `{"status": <"alert" if total>=5 else "warn" if total>=3 else "quiet">, ` +
          `"threshold": 3, "observed_total": <the total>, "evidence_refs": ` +
          `["count-summary"]}. Then report status "done".`,
      };
    case ALERT_PROJECTION:
      return {
        name: "Alert Projection",
        maintains: [
          "`structured_summary`: material status+total.",
          "`markdown`/`html`: derived projections (cosmetic).",
        ],
        requires: ["Alert State"],
        continuity: "Input-driven.",
        execution:
          `Read your upstream producer BY REFERENCE: \`wm_list_upstream\` then ` +
          `\`wm_read_upstream\` with that producer and path \`${TRUTH}\`. Read its ` +
          `\`status\` and \`observed_total\`. Then write \`${TRUTH}\` to your ` +
          `workspace, valid JSON: {"structured_summary": {"status": <the status>, ` +
          `"total": <the observed_total>}, "markdown": <a one-line markdown ` +
          `heading summarizing the alert>, "html": <the same as a one-line ` +
          `<p> tag>}. Then report status "done".`,
      };
    case RAW_EVENT_AUDITOR:
      return {
        name: "Raw Event Auditor",
        maintains: ["`raw_event_audit`: accepted/malformed/duplicate ids."],
        requires: ["the gateway's raw_events facet"],
        continuity: "Input-driven.",
        execution:
          `Read your upstream producer BY REFERENCE: \`wm_list_upstream\` then ` +
          `\`wm_read_upstream\` with that producer and path \`${TRUTH}\`. Read its ` +
          `\`events\` array. Then write \`${TRUTH}\` to your workspace, valid JSON: ` +
          `{"duplicate_event_ids": [], "malformed_events": [], ` +
          `"accepted_event_ids": <the list of event \`id\`s>}. Then report ` +
          `status "done".`,
      };
    case COUNT_TREND:
      return {
        name: "Count Trend",
        maintains: ["`count_trend`: current vs previous total + direction."],
        requires: ["the gateway's counts facet", "prior Count Trend"],
        continuity: "Input-driven plus self-driven recheck.",
        execution:
          `Read your upstream producer BY REFERENCE: \`wm_list_upstream\` then ` +
          `\`wm_read_upstream\` with that producer and path \`${TRUTH}\`. Read its ` +
          `\`counts_by_kind\` and compute the current total (sum of the counts). ` +
          `Then write \`${TRUTH}\` to your workspace, valid JSON: ` +
          `{"current_total": <the total>, "previous_total": 0, "direction": ` +
          `<"up" if current_total>0 else "flat">, "valid_until": <the current ` +
          `total>}. Then report status "done".`,
      };
    case EXECUTIVE_SNAPSHOT:
      return {
        name: "Executive Snapshot",
        maintains: ["`executive_snapshot`: fan-in of alert+audit+trend."],
        requires: ["Alert State", "Raw Event Auditor", "Count Trend"],
        continuity: "Input-driven.",
        execution:
          `You subscribe to THREE upstream producers. Call \`wm_list_upstream\` to ` +
          `discover all three, then \`wm_read_upstream\` (path \`${TRUTH}\`) for EACH ` +
          `of them. From the alert-state producer read \`status\`; from the ` +
          `count-trend producer read \`current_total\` and \`direction\`; from the ` +
          `raw-event-auditor producer read \`malformed_events\`. Then write ` +
          `\`${TRUTH}\` to your workspace, valid JSON: {"status": <the status>, ` +
          `"total": <the current_total>, "audit_health": <"ok" if malformed_events ` +
          `is empty else "degraded">, "trend": <the direction>, "evidence_refs": ` +
          `["alert-state","raw-event-auditor","count-trend"]}. Then report ` +
          `status "done".`,
      };
    default:
      throw new Error(`no contract for ${node}`);
  }
}

// ---------------------------------------------------------------------------
// Topology + canonicalizers per node (the deterministic seam; only render is live)
// ---------------------------------------------------------------------------

interface NodeSpec {
  readonly id: string;
  readonly wake: "external" | "input";
  readonly edges: readonly { producer: string; facet: Facet }[];
  readonly canonicalizer: Canonicalizer;
}

const NODE_SPECS: readonly NodeSpec[] = [
  {
    id: GATEWAY,
    wake: "external",
    edges: [{ producer: SOURCE, facet: INBOX }],
    canonicalizer: gatewayCanon,
  },
  {
    id: COUNT_SUMMARY,
    wake: "input",
    edges: [{ producer: GATEWAY, facet: COUNTS }],
    canonicalizer: atomicTruth,
  },
  {
    id: ALERT_STATE,
    wake: "input",
    edges: [{ producer: COUNT_SUMMARY, facet: ATOMIC_FACET }],
    canonicalizer: atomicTruth,
  },
  {
    id: ALERT_PROJECTION,
    wake: "input",
    edges: [{ producer: ALERT_STATE, facet: ATOMIC_FACET }],
    canonicalizer: projectionCanon,
  },
  {
    id: RAW_EVENT_AUDITOR,
    wake: "input",
    edges: [{ producer: GATEWAY, facet: RAW_EVENTS }],
    canonicalizer: atomicTruth,
  },
  {
    id: COUNT_TREND,
    wake: "input",
    edges: [{ producer: GATEWAY, facet: COUNTS }],
    canonicalizer: atomicTruth,
  },
  {
    id: EXECUTIVE_SNAPSHOT,
    wake: "input",
    edges: [
      { producer: ALERT_STATE, facet: ATOMIC_FACET },
      { producer: RAW_EVENT_AUDITOR, facet: ATOMIC_FACET },
      { producer: COUNT_TREND, facet: ATOMIC_FACET },
    ],
    canonicalizer: atomicTruth,
  },
];

function counterTopology(): ReconcilerTopology {
  const contract_fingerprints: Record<string, Fingerprint> = {};
  for (const s of NODE_SPECS) {
    contract_fingerprints[s.id] = asFingerprint(`contract:${s.id}@live`);
  }
  return {
    topology: {
      nodes: NODE_SPECS.map((s) => ({
        node: asNodeId(s.id),
        contract_fingerprint: contract_fingerprints[s.id] as Fingerprint,
        wake_source: s.wake,
      })),
      edges: NODE_SPECS.flatMap((s) =>
        s.edges.map((e) => ({
          subscriber: asNodeId(s.id),
          producer: asNodeId(e.producer),
          facet: e.facet,
        })),
      ),
      entry_points: [asNodeId(GATEWAY)],
      acyclic: true,
    },
    contract_fingerprints,
  };
}

/**
 * Stage the external inbox onto the phantom SOURCE producer's PUBLISHED truth +
 * an external receipt (so the gateway's `inbound_edges`→`upstream` can read it via
 * `wm_read_upstream`, and the gateway's `inbox` input fingerprint moves). Mirrors
 * the offline `injectExternalReceipt`, inline so the live graph is self-contained.
 */
function stageInbox(
  store: WorldModelStore,
  ledger: ReturnType<typeof mountDag>["ledger"],
  inbox: readonly CounterEvent[],
): void {
  const commit = store.commitPublished(
    SOURCE,
    files({ [INBOX_FILE]: jsonFile(inbox) }),
    ingressCanon,
  );
  const prev = ledger.lastReceipt(SOURCE);
  const prevRef = prev !== null ? ledger.addressOf(prev) : null;
  ledger.append({
    node: asNodeId(SOURCE),
    contract_fingerprint: asFingerprint(`contract:${SOURCE}@ingress`),
    wake: { source: "external", refs: [] },
    input_fingerprints: [],
    fingerprints: commit.fingerprints,
    semantic_diff: EMPTY_SEMANTIC_DIFF,
    prev: prevRef,
    status: "rendered",
    cost: zeroCost("external"),
    sig: createNullSignature(),
  });
}

// ---------------------------------------------------------------------------
// The live mounted Counter graph: every node a real createAgentRender, wrapped
// to COUNT invocations (so the no-change re-run can assert ZERO model calls).
// ---------------------------------------------------------------------------

interface LiveGraph {
  readonly dag: ReturnType<typeof mountDag>;
  readonly store: WorldModelStore;
  readonly renderCounts: Record<string, number>;
}

function buildLiveGraph(wmDir: string): LiveGraph {
  const store = new FileSystemWorldModelStore({ directory: wmDir });
  const provider = createOpenRouterProvider();
  const renderCounts: Record<string, number> = {};

  // ONE factory per node (each closes over the node's contract via contractFor,
  // which keys off ctx.node — so a single factory serves the whole DAG). Wrap it
  // to tally invocations: a memo-skip never reaches the render, so a re-run that
  // skips leaves these counts unmoved (the "zero model calls" proof).
  const render = createAgentRender({
    store,
    contractFor: liveContractFor,
    provider,
    temperature: 0,
    seed: 7,
    maxTurns: 14,
  });
  const counting: AsyncMountedRender = async (ctx: RenderContext) => {
    renderCounts[ctx.node] = (renderCounts[ctx.node] ?? 0) + 1;
    return render(ctx);
  };

  const asyncMounts = Object.fromEntries(
    NODE_SPECS.map((s) => [
      s.id,
      { render: counting, canonicalizer: s.canonicalizer },
    ]),
  );

  const dag = mountDag({
    topology: counterTopology(),
    mounts: {},
    asyncMounts,
    store,
  });
  return { dag, store, renderCounts };
}

function publishedTruth(
  store: WorldModelStore,
  node: string,
): Record<string, unknown> | null {
  const read = store.read(node, "published");
  if (read.ref.version === null) return null;
  const bytes = read.files[TRUTH];
  if (bytes === undefined) return null;
  return JSON.parse(readTextFile(bytes)) as Record<string, unknown>;
}

// ===========================================================================
// THE LIVE HEADLINE — boot the Counter graph with REAL renders over one payload,
// assert the canonical shapes commit + propagate, then a no-change re-run SKIPS
// every node with ZERO model calls. Gated; skips offline.
// ===========================================================================

test(
  "IT-1 LIVE: the Counter mini-graph commits + propagates live, and a no-change re-run memo-skips every node with zero model calls",
  { skip: hasOpenRouterKey() ? false : "OPENROUTER_API_KEY not set" },
  async () => {
    const wmDir = mkdtempSync(join(tmpdir(), "it1-wm-"));
    try {
      const { dag, store, renderCounts } = buildLiveGraph(wmDir);

      // One Counter payload: two `alpha` + one `beta` ⇒ counts {alpha:2, beta:1},
      // total 3 ⇒ threshold crossed ⇒ Alert State `warn`.
      const inbox: CounterEvent[] = [
        { id: "e1", kind: "alpha", value: 1 },
        { id: "e2", kind: "alpha", value: 1 },
        { id: "e3", kind: "beta", value: 1 },
      ];
      stageInbox(store, dag.ledger, inbox);

      // --- ingest: wake the gateway and drain the whole graph to quiescence with
      // LIVE renders. The diamond reconverges at Executive Snapshot.
      const r = await dag.ingestAsync(GATEWAY);

      // (a) the GATEWAY committed a fingerprinted world-model carrying BOTH facets.
      equal(
        dispositionOf(r, GATEWAY),
        "rendered",
        "the live gateway must commit",
      );
      const gwRead = store.read(GATEWAY, "published");
      notEqual(gwRead.ref.version, null);
      const gwReceipt = lastReceipt(dag.ledger, GATEWAY);
      ok(gwReceipt);
      ok(gwReceipt.fingerprints[RAW_EVENTS], "gateway must publish raw_events facet");
      ok(gwReceipt.fingerprints[COUNTS], "gateway must publish counts facet");

      // (b) Count Summary AND Count Trend COMMIT — the `counts` facet propagated
      // gateway → both subscribers (linear + the self-recheck node), each rendered.
      equal(
        dispositionOf(r, COUNT_SUMMARY),
        "rendered",
        "Count Summary must commit (counts facet propagated)",
      );
      equal(
        dispositionOf(r, COUNT_TREND),
        "rendered",
        "Count Trend must commit (counts facet propagated)",
      );
      // Each carried ≥1 consumed upstream fingerprint (real propagation, not seed).
      ok(
        (lastReceipt(dag.ledger, COUNT_SUMMARY)?.input_fingerprints.length ?? 0) >
          0,
      );
      ok(
        (lastReceipt(dag.ledger, COUNT_TREND)?.input_fingerprints.length ?? 0) > 0,
      );

      // The raw_events branch also woke (the auditor); the linear chain reached
      // Alert State + Alert Projection.
      ok(woke(r, RAW_EVENT_AUDITOR));
      equal(dispositionOf(r, ALERT_STATE), "rendered");
      equal(dispositionOf(r, ALERT_PROJECTION), "rendered");

      // (c) Executive Snapshot COMMITS exactly ONCE for its fan-in input tuple —
      // the diamond reconverges to a single render, not one-per-inbound-edge.
      equal(
        countDisposition(r, EXECUTIVE_SNAPSHOT, "rendered"),
        1,
        "Executive Snapshot must render exactly once for the diamond fan-in tuple",
      );
      // Its receipt cites the three inbound producers' fingerprints.
      equal(
        lastReceipt(dag.ledger, EXECUTIVE_SNAPSHOT)?.input_fingerprints.length,
        3,
        "Executive Snapshot must consume exactly its three inbound producer fingerprints",
      );

      // Sanity on real content: the gateway de-duplicated to 3 events; Count
      // Summary's total is 3. (Loose — the model wrote the structured truth.)
      const gwTruth = publishedTruth(store, GATEWAY);
      equal((gwTruth?.["events"] as unknown[])?.length, 3);
      const summaryTruth = publishedTruth(store, COUNT_SUMMARY);
      equal(summaryTruth?.["total"], 3);

      // Snapshot the render tallies after the first full cascade. Every node ran
      // at least once; record the totals so the re-run can prove they DON'T move.
      const countsAfterFirst = { ...renderCounts };
      for (const s of NODE_SPECS) {
        ok(
          (countsAfterFirst[s.id] ?? 0) >= 1,
          `${s.id} must have rendered live at least once on the cold cascade`,
        );
      }

      // (d) NO-CHANGE RE-RUN: re-stage the IDENTICAL inbox (unmoved `inbox` facet)
      // and re-wake the gateway. The gateway's memo key is unmoved, so it SKIPS;
      // a skip propagates nothing, so NO downstream node wakes — and CRUCIALLY no
      // render body runs for ANY node (zero model calls).
      stageInbox(store, dag.ledger, inbox); // identical ⇒ inbox facet unmoved
      const again = await dag.ingestAsync(GATEWAY);

      equal(
        dispositionOf(again, GATEWAY),
        "skipped",
        "the gateway must memo-skip on an unmoved inbox (zero model calls)",
      );
      // No downstream node woke at all (a skip propagates nothing).
      for (const s of NODE_SPECS) {
        if (s.id === GATEWAY) continue;
        ok(
          !woke(again, s.id),
          `${s.id} must not wake on a no-change re-run`,
        );
      }
      // ZERO model calls on the re-run: every node's render tally is UNMOVED.
      for (const s of NODE_SPECS) {
        equal(
          renderCounts[s.id] ?? 0,
          countsAfterFirst[s.id] ?? 0,
          `${s.id} must not render on a no-change re-run (zero model calls)`,
        );
      }
    } finally {
      rmSync(wmDir, { recursive: true, force: true });
    }
  },
);
