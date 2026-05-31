// IT-2 — Masked Relay, scaled, LIVE (the upstream-read + read-isolation stress test).
// Source: tests/masked-relay.md; INTEGRATION-TESTS-PLAN.md §3 IT-2.
//
// The offline sibling (`masked-relay.test.ts`) asserts the run-loop MECHANICS over
// the ~10-node masked-relay topology with DETERMINISTIC FAKE renders — zero model
// calls, the green bar that gates the commit. THIS file is the key-gated LIVE smoke:
// it boots the SAME topology, swaps every fake render for the live
// `createAgentRender` adapter (real google/gemini-3.5-flash @ temp 0), and kicks the
// tires on the new `wm_read_upstream` + read-isolation seam end to end:
//
//   Signal Inbox → Signal Ledger → 3 Scouts (peer-blind) → Viewport Masker
//     → 2 Expanders (each a DIFFERENT masked view) → 2 Critics → Synthesizer → Auditor
//
// The headline (INTEGRATION-TESTS-PLAN.md §3 IT-2):
//   (a) the scouts render PEER-BLIND — the read-isolation pin gives each scout only
//       the Signal Ledger as an upstream subscription, so a scout literally CANNOT
//       read a sibling scout (the pin is wired off the topology's inbound edges);
//   (b) the masker emits a DETERMINISTIC masked set (one masked-view facet per
//       expander, over its own visible subset);
//   (c) the expanders render from their MASKED views — proving `wm_read_upstream`
//       works LIVE across nodes (an expander reads the masker's published truth by
//       reference and consumes only its assigned slot);
//   (d) the synthesizer commits an InsightMemo citing the changed upstream receipts
//       (full provenance);
//   (e) a NO-CHANGE re-run (re-wake the gateway with the SAME inbox) SKIPS every
//       node with ZERO model calls (memo-skip, live).
//
// Wiring (the GROUND BRIEF's preferred path): reuse the scenario topology +
// hand-authored DETERMINISTIC canonicalizers (the masked-view facet tokens are
// load-bearing for propagation — the masker mounts the facet-carrying `maskerCanon`,
// NOT the atomic one), and inject the LIVE render at the mount site via `asyncMounts`
// + `dag.ingestAsync`. No parallel harness; the `AsyncMountedRender` seam is the
// composition point and the reconciler cannot tell a live render from a fake one.
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
  type Facet,
} from "../../shapes";
import {
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
import { dispositionOf, lastReceipt, woke } from "../trace";
import type { ReconcilerTopology } from "../../reactor";

// ---------------------------------------------------------------------------
// Identities + facets (a self-contained live graph mirroring the offline fixture)
// ---------------------------------------------------------------------------

const SOURCE = "ingress.signal-inbox";
const GATEWAY = "gateway.signal-inbox";
const SIGNAL_LEDGER = "responsibility.signal-ledger";
const SCOUT_PRICE = "responsibility.scout-price";
const SCOUT_FRICTION = "responsibility.scout-friction";
const SCOUT_DESIRE = "responsibility.scout-desire";
const SCOUTS = [SCOUT_PRICE, SCOUT_FRICTION, SCOUT_DESIRE] as const;
const VIEWPORT_MASKER = "responsibility.viewport-masker";
const EXPANDER_1 = "responsibility.expander-1";
const EXPANDER_2 = "responsibility.expander-2";
const EXPANDERS = [EXPANDER_1, EXPANDER_2] as const;
const CRITIC_STRONG = "responsibility.critic-strong";
const CRITIC_WEAK = "responsibility.critic-weak";
const CRITICS = [CRITIC_STRONG, CRITIC_WEAK] as const;
const SYNTHESIZER = "responsibility.insight-synthesizer";
const AUDITOR = "responsibility.diversity-auditor";

const INBOX: Facet = "inbox";
const LEDGER: Facet = "ledger";
const VIEW_E1: Facet = "view_e1";
const VIEW_E2: Facet = "view_e2";

const TRUTH = "truth.json";
const INBOX_FILE = "inbox.json";

interface Signal {
  readonly id: string;
  readonly source: string;
  readonly text: string;
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

const atomicTruth: Canonicalizer = (fm) => ({
  [ATOMIC_FACET]: fingerprintFm(fm),
});

function fingerprintFm(fm: WorldModelFiles): string {
  // Inline the artifact fingerprint over the whole file map (avoids importing the
  // helper name; same semantics as the offline fixture's atomicTruth).
  return materialFingerprint(
    Object.fromEntries(
      Object.keys(fm)
        .sort()
        .map((k) => [k, readTextFile(fm[k]!)]),
    ),
  );
}

/** Gateway: the deduped signal ledger is the single `ledger` facet. */
const gatewayCanon: Canonicalizer = (fm) => {
  const t = readTruth(fm);
  return {
    [ATOMIC_FACET]: fingerprintFm(fm),
    [LEDGER]: materialFingerprint(t["items"] ?? []),
  };
};

/** Ingress (phantom source): the raw inbox is the single `inbox` facet. */
const ingressCanon: Canonicalizer = (fm) => {
  const bytes = fm[INBOX_FILE];
  const inbox = bytes === undefined ? [] : JSON.parse(readTextFile(bytes));
  return {
    [ATOMIC_FACET]: fingerprintFm(fm),
    [INBOX]: materialFingerprint(inbox),
  };
};

/**
 * Viewport Masker: ONE masked-view facet per consumer slot (partial visibility).
 * Each facet token is over ONLY that consumer's visible subset — so Expander 1's
 * `view_e1` facet moves iff ITS visible set moves, independent of Expander 2's. The
 * masker render writes a `views` object keyed by the expander node-ids.
 */
const maskerCanon: Canonicalizer = (fm) => {
  const t = readTruth(fm);
  const views = (t["views"] ?? {}) as Record<string, { visible?: unknown }>;
  return {
    [ATOMIC_FACET]: fingerprintFm(fm),
    [VIEW_E1]: materialFingerprint(views[EXPANDER_1]?.visible ?? []),
    [VIEW_E2]: materialFingerprint(views[EXPANDER_2]?.visible ?? []),
  };
};

// ---------------------------------------------------------------------------
// The live contract views: each node's `### Maintains` + the EXACT file shape so
// the deterministic canonicalizers above find their tokens. The model reads its
// upstream truth BY REFERENCE via wm_list_upstream / wm_read_upstream — the
// read-isolation pin (off the topology edges) is what makes the scouts peer-blind.
// ---------------------------------------------------------------------------

function liveContractFor(node: string): CompiledContractView {
  if (node === GATEWAY) {
    return {
      name: "Signal Inbox",
      maintains: ["`ledger`: the de-duplicated signal ledger."],
      requires: ["the raw signal inbox"],
      continuity: "External: a gateway turns each arrival into a receipt.",
      execution:
        `Read your inbox BY REFERENCE: call \`wm_list_upstream\` to find your ` +
        `upstream producer, then \`wm_read_upstream\` with that producer and path ` +
        `\`${INBOX_FILE}\` to read a JSON array of signals (each {id, source, text}). ` +
        `De-duplicate by \`id\`. Then write \`${TRUTH}\` to your workspace, valid ` +
        `JSON of EXACTLY this shape: {"items": [ {"id": string, "source": string, ` +
        `"text": string} ], "count": <number of de-duplicated signals>}. Then ` +
        `report status "done".`,
    };
  }
  if (node === SIGNAL_LEDGER) {
    return {
      name: "Signal Ledger",
      maintains: ["`signal_ledger`: normalized items with dedupe keys."],
      requires: ["the gateway's ledger facet"],
      continuity: "Input-driven.",
      execution:
        `Read your upstream producer BY REFERENCE: \`wm_list_upstream\` then ` +
        `\`wm_read_upstream\` with that producer and path \`${TRUTH}\`. Read its ` +
        `\`items\` array. Then write \`${TRUTH}\` to your workspace, valid JSON: ` +
        `{"items": [ {"id": <the signal id>, "source": <the signal source>, ` +
        `"dedupe_key": <"<source>:<id>">} ]}. Then report status "done".`,
    };
  }
  if ((SCOUTS as readonly string[]).includes(node)) {
    const persona =
      node === SCOUT_PRICE
        ? "price anxiety"
        : node === SCOUT_FRICTION
          ? "workflow friction"
          : "latent desire";
    return {
      name: `Stage 1 Scout: ${persona}`,
      maintains: ["`scout_ledger`: persona-tagged claims with stable claim-ids."],
      requires: ["the Signal Ledger ONLY (you are peer-blind to sibling scouts)"],
      continuity: "Input-driven. Do NOT read sibling scouts.",
      execution:
        `You are the "${persona}" scout. Read ONLY the Signal Ledger BY REFERENCE: ` +
        `\`wm_list_upstream\` then \`wm_read_upstream\` with that producer and path ` +
        `\`${TRUTH}\`. (You are PEER-BLIND: you do not subscribe to any sibling scout ` +
        `and must not try to read one.) For EACH ledger item, emit one claim with a ` +
        `claim_id of EXACTLY the string \`${node === SCOUT_PRICE ? "price" : node === SCOUT_FRICTION ? "friction" : "desire"}:<the item id>\`. ` +
        `Then write \`${TRUTH}\` to your workspace, valid JSON: {"persona": ` +
        `"${persona}", "claims": [ {"claim_id": <as specified>, "evidence_ref": ` +
        `<the item id>} ], "claim_ids": [ <every claim_id, as strings> ]}. Then ` +
        `report status "done".`,
    };
  }
  if (node === VIEWPORT_MASKER) {
    return {
      name: "Viewport Masker",
      maintains: [
        "`view_e1`: Expander 1's visible claim-id subset.",
        "`view_e2`: Expander 2's visible claim-id subset.",
      ],
      requires: ["all three Stage-1 Scouts"],
      continuity: "Input-driven. Use a deterministic split so the run replays.",
      execution:
        `You subscribe to THREE scouts. Call \`wm_list_upstream\` to discover them, ` +
        `then \`wm_read_upstream\` (path \`${TRUTH}\`) for EACH, and gather EVERY ` +
        `\`claim_id\` from their \`claim_ids\` arrays into one sorted list. Now split ` +
        `that list DETERMINISTICALLY into two masked views (this is a fixed rule, no ` +
        `randomness): a claim is VISIBLE to "${EXPANDER_1}" iff its index in the ` +
        `sorted list is EVEN, and VISIBLE to "${EXPANDER_2}" iff its index is ODD. ` +
        `Then write \`${TRUTH}\` to your workspace, valid JSON of EXACTLY this shape: ` +
        `{"seed": 1729, "views": {"${EXPANDER_1}": {"visible": [<even-index ` +
        `claim_ids, sorted>], "hidden_count": <count of the rest>}, "${EXPANDER_2}": ` +
        `{"visible": [<odd-index claim_ids, sorted>], "hidden_count": <count of the ` +
        `rest>}}, "coverage_matrix": {"${EXPANDER_1}": <count visible to e1>, ` +
        `"${EXPANDER_2}": <count visible to e2>}}. Then report status "done".`,
    };
  }
  if ((EXPANDERS as readonly string[]).includes(node)) {
    return {
      name: `Stage 2 Expander (${node})`,
      maintains: ["`expansion_ledger`: expansions of ONLY your visible claims."],
      requires: [`your assigned masked view from the Viewport Masker`],
      continuity: "Input-driven. Do NOT read the peer expander or the other view.",
      execution:
        `You subscribe to the Viewport Masker (your assigned masked view ONLY). ` +
        `Call \`wm_list_upstream\`, then \`wm_read_upstream\` on the ` +
        `Viewport Masker producer (path \`${TRUTH}\`). From its \`views\` object read ` +
        `ONLY the entry keyed by your OWN node id \`${node}\` — that is your assigned ` +
        `masked view; its \`visible\` array is the ONLY claims you may expand. (You ` +
        `are partial-visibility: do NOT read the other expander's view, do NOT read a ` +
        `peer expander.) Then write \`${TRUTH}\` to your workspace, valid JSON: ` +
        `{"slot": "${node}", "visible_count": <length of your visible array>, ` +
        `"expanded_claims": [ {"from_claim": <a visible claim_id>, "hypothesis": ` +
        `<"expanded(<claim_id>)">} ]}. Then report status "done".`,
    };
  }
  if ((CRITICS as readonly string[]).includes(node)) {
    const mode = node === CRITIC_STRONG ? "strongest case" : "weakest claim";
    return {
      name: `Stage 3 Critic (${mode})`,
      maintains: ["`critic_ledger`: a critique over the expansions."],
      requires: ["both Stage-2 Expanders"],
      continuity: "Input-driven.",
      execution:
        `You subscribe to BOTH expanders. Call \`wm_list_upstream\`, then ` +
        `\`wm_read_upstream\` (path \`${TRUTH}\`) for EACH expander. Count the total ` +
        `\`expanded_claims\` across both. Then write \`${TRUTH}\` to your workspace, ` +
        `valid JSON: {"mode": "${mode}", "claims_reviewed": <the total count>, ` +
        `"critique": <a one-line critique string>}. Then report status "done".`,
    };
  }
  if (node === SYNTHESIZER) {
    return {
      name: "Insight Synthesizer",
      maintains: ["`insight_memo`: the InsightMemo over the full receipt trail."],
      requires: ["all Scouts", "all Expanders", "all Critics"],
      continuity: "Input-driven. Reuse the prior memo if nothing moved.",
      execution:
        `You see the FULL upstream trail. Call \`wm_list_upstream\` to enumerate ` +
        `every producer you subscribe to (scouts, expanders, critics), then ` +
        `\`wm_read_upstream\` (path \`${TRUTH}\`) for EACH. Then write \`${TRUTH}\` ` +
        `to your workspace, valid JSON of an InsightMemo: {"headline": <one short ` +
        `non-obvious insight string>, "evidence_refs": [ <the EXACT node id of EVERY ` +
        `upstream producer you successfully read> ], "best_objection": <one string>, ` +
        `"recommended_probe": <one string>, "changed_since_last": <one short string ` +
        `naming what moved>}. The \`evidence_refs\` array MUST list every upstream ` +
        `node id you read. Then report status "done".`,
    };
  }
  if (node === AUDITOR) {
    return {
      name: "Diversity Auditor",
      maintains: ["`diversity_audit`: a terminal diagnostic over the memo + masks."],
      requires: ["the Insight Synthesizer", "the Viewport Masker"],
      continuity: "Input-driven. A terminal diagnostic — it rewires nothing.",
      execution:
        `You subscribe to the Synthesizer and the Masker. Call \`wm_list_upstream\`, ` +
        `then \`wm_read_upstream\` (path \`${TRUTH}\`) for each. Then write ` +
        `\`${TRUTH}\` to your workspace, valid JSON: {"convergence_score": <count of ` +
        `the memo's evidence_refs>, "mask_rate_recommendation": "hold", ` +
        `"show_all_baseline_recommendation": "no"}. Then report status "done".`,
    };
  }
  throw new Error(`no contract for ${node}`);
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
    id: SIGNAL_LEDGER,
    wake: "input",
    edges: [{ producer: GATEWAY, facet: LEDGER }],
    canonicalizer: atomicTruth,
  },
  // The three scouts are PEER-BLIND: each subscribes ONLY to the Signal Ledger.
  ...SCOUTS.map((id) => ({
    id,
    wake: "input" as const,
    edges: [{ producer: SIGNAL_LEDGER, facet: ATOMIC_FACET }],
    canonicalizer: atomicTruth,
  })),
  {
    id: VIEWPORT_MASKER,
    wake: "input",
    edges: SCOUTS.map((s) => ({ producer: s, facet: ATOMIC_FACET })),
    canonicalizer: maskerCanon,
  },
  // Each expander subscribes to ONLY ITS masked-view facet — never the ledger
  // atomic (that would wake it on every signal), never the peer view/expander. Its
  // masked view carries the visible claim-ids it expands (partial visibility).
  {
    id: EXPANDER_1,
    wake: "input",
    edges: [{ producer: VIEWPORT_MASKER, facet: VIEW_E1 }],
    canonicalizer: atomicTruth,
  },
  {
    id: EXPANDER_2,
    wake: "input",
    edges: [{ producer: VIEWPORT_MASKER, facet: VIEW_E2 }],
    canonicalizer: atomicTruth,
  },
  // Critics subscribe to BOTH expanders.
  ...CRITICS.map((id) => ({
    id,
    wake: "input" as const,
    edges: EXPANDERS.map((e) => ({ producer: e, facet: ATOMIC_FACET })),
    canonicalizer: atomicTruth,
  })),
  {
    id: SYNTHESIZER,
    wake: "input",
    edges: [...SCOUTS, ...EXPANDERS, ...CRITICS].map((p) => ({
      producer: p,
      facet: ATOMIC_FACET,
    })),
    canonicalizer: atomicTruth,
  },
  {
    id: AUDITOR,
    wake: "input",
    edges: [
      { producer: SYNTHESIZER, facet: ATOMIC_FACET },
      { producer: VIEWPORT_MASKER, facet: ATOMIC_FACET },
    ],
    canonicalizer: atomicTruth,
  },
];

function relayTopology(): ReconcilerTopology {
  const contract_fingerprints: Record<string, string> = {};
  for (const s of NODE_SPECS) {
    contract_fingerprints[s.id] = `contract:${s.id}@live`;
  }
  return {
    topology: {
      nodes: NODE_SPECS.map((s) => ({
        node: s.id,
        contract_fingerprint: contract_fingerprints[s.id] as string,
        wake_source: s.wake,
      })),
      edges: NODE_SPECS.flatMap((s) =>
        s.edges.map((e) => ({
          subscriber: s.id,
          producer: e.producer,
          facet: e.facet,
        })),
      ),
      entry_points: [GATEWAY],
      acyclic: true,
    },
    contract_fingerprints,
  };
}

/** Stage the external inbox onto the phantom SOURCE producer's published truth. */
function stageInbox(
  store: WorldModelStore,
  ledger: ReturnType<typeof mountDag>["ledger"],
  inbox: readonly Signal[],
): void {
  const commit = store.commitPublished(
    SOURCE,
    files({ [INBOX_FILE]: jsonFile(inbox) }),
    ingressCanon,
  );
  const prev = ledger.lastReceipt(SOURCE);
  const prevRef = prev !== null ? ledger.addressOf(prev) : null;
  ledger.append({
    node: SOURCE,
    contract_fingerprint: `contract:${SOURCE}@ingress`,
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
// The live mounted relay graph: every node a real createAgentRender, wrapped to
// COUNT invocations (so the no-change re-run can assert ZERO model calls).
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

  const render = createAgentRender({
    store,
    contractFor: liveContractFor,
    provider,
    temperature: 0,
    seed: 7,
    maxTurns: 16,
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
    topology: relayTopology(),
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
// THE LIVE HEADLINE — boot the masked relay with REAL renders over one ticket,
// assert peer-blind scouts + a deterministic masked set + masked-view expanders
// (cross-node wm_read_upstream) + a full-provenance InsightMemo, then a no-change
// re-run SKIPS every node with ZERO model calls. Gated; skips offline.
// ===========================================================================

test(
  "IT-2 LIVE: the masked relay renders peer-blind scouts, deterministic masks, masked-view expanders (wm_read_upstream cross-node) + a full-provenance memo; a no-change re-run memo-skips with zero model calls",
  { skip: hasOpenRouterKey() ? false : "OPENROUTER_API_KEY not set" },
  async () => {
    const wmDir = mkdtempSync(join(tmpdir(), "it2-wm-"));
    try {
      const { dag, store, renderCounts } = buildLiveGraph(wmDir);

      // One tiny support-ticket payload (+ a couple of sibling signals so the scouts
      // produce >1 claim and the masker has something to split). Minimal, but enough
      // to exercise the masked-view split.
      const inbox: Signal[] = [
        { id: "t1", source: "support_ticket", text: "export is too slow to use daily" },
        { id: "c1", source: "customer_call", text: "the price jump surprised us" },
        { id: "d1", source: "lost_deal", text: "we wanted a feature you do not have yet" },
      ];
      stageInbox(store, dag.ledger, inbox);

      // --- ingest: wake the gateway and drain the whole relay to quiescence LIVE.
      const r = await dag.ingestAsync(GATEWAY);

      // The gateway + ledger committed (the relay booted).
      equal(dispositionOf(r, GATEWAY), "rendered", "the live gateway must commit");
      equal(dispositionOf(r, SIGNAL_LEDGER), "rendered", "the ledger must commit");

      // (a) PEER-BLIND scouts: every scout committed, and each scout's RESOLVED
      // inbound edges (the read-isolation pin's basis) are exactly { Signal Ledger }
      // — NO sibling scout. So a scout's render literally cannot read a sibling.
      const edges = relayTopology().topology.edges;
      for (const scout of SCOUTS) {
        equal(
          dispositionOf(r, scout),
          "rendered",
          `${scout} must commit (peer-blind, ledger only)`,
        );
        const producers = edges
          .filter((e) => e.subscriber === scout)
          .map((e) => e.producer);
        equal(producers.length, 1, `${scout} must have exactly one upstream`);
        equal(producers[0], SIGNAL_LEDGER, `${scout} must subscribe ONLY to the ledger`);
        // None of the scout's subscriptions is a sibling scout.
        for (const sib of SCOUTS) {
          if (sib === scout) continue;
          ok(!producers.includes(sib), `${scout} must not subscribe to ${sib}`);
        }
        // Each scout consumed exactly its one (ledger) upstream fingerprint.
        const rec = lastReceipt(dag.ledger, scout);
        ok(rec);
        equal(
          rec.input_fingerprints.length,
          1,
          `${scout} must consume exactly its single ledger fingerprint`,
        );
      }

      // (b) DETERMINISTIC masked set: the masker committed, publishing a `views`
      // object keyed by the two expander node-ids, each with a `visible` subset; and
      // both masked-view facets are present on its receipt.
      equal(
        dispositionOf(r, VIEWPORT_MASKER),
        "rendered",
        "the masker must commit a masked set",
      );
      const maskRec = lastReceipt(dag.ledger, VIEWPORT_MASKER);
      ok(maskRec);
      ok(maskRec.fingerprints[VIEW_E1], "the masker must publish the view_e1 facet");
      ok(maskRec.fingerprints[VIEW_E2], "the masker must publish the view_e2 facet");
      const maskTruth = publishedTruth(store, VIEWPORT_MASKER);
      const views = (maskTruth?.["views"] ?? {}) as Record<
        string,
        { visible?: string[] }
      >;
      ok(Array.isArray(views[EXPANDER_1]?.visible), "view for expander-1 present");
      ok(Array.isArray(views[EXPANDER_2]?.visible), "view for expander-2 present");

      // (c) MASKED-VIEW expanders — the cross-node wm_read_upstream proof. Each
      // expander committed, reading ONLY its assigned slot from the masker's
      // published truth (proving wm_read_upstream works LIVE across nodes), and its
      // `visible_count` matches its OWN masked view's length — NOT the peer's.
      for (const exp of EXPANDERS) {
        equal(
          dispositionOf(r, exp),
          "rendered",
          `${exp} must commit from its masked view`,
        );
        const expTruth = publishedTruth(store, exp);
        const ownVisible = views[exp]?.visible ?? [];
        equal(
          expTruth?.["visible_count"],
          ownVisible.length,
          `${exp} must expand exactly its OWN masked view (cross-node read)`,
        );
        // The expander's inbound edges include the masker's OWN-slot facet, never
        // the peer's facet, never the peer expander.
        const expProducers = edges
          .filter((e) => e.subscriber === exp)
          .map((e) => e.producer);
        const peer = exp === EXPANDER_1 ? EXPANDER_2 : EXPANDER_1;
        ok(!expProducers.includes(peer), `${exp} must not subscribe to ${peer}`);
      }
      // The two expanders saw DIFFERENT masked views (real masking, not pass-through).
      notEqual(
        JSON.stringify(views[EXPANDER_1]?.visible ?? []),
        JSON.stringify(views[EXPANDER_2]?.visible ?? []),
        "the two expanders must see different masked views",
      );

      // (d) FULL-PROVENANCE InsightMemo: the synthesizer committed, citing the
      // upstream producers it read; its receipt consumed the wide fan-in tuple.
      ok(
        woke(r, SYNTHESIZER) && publishedTruth(store, SYNTHESIZER) !== null,
        "the synthesizer must commit an InsightMemo",
      );
      const memo = publishedTruth(store, SYNTHESIZER);
      const cited = (memo?.["evidence_refs"] ?? []) as string[];
      // It cites at least one producer from EACH stage it subscribes to (the full
      // trail) — loose on exact membership (the model wrote it), strict on coverage.
      ok(
        SCOUTS.some((s) => cited.includes(s)),
        "the memo must cite at least one scout",
      );
      ok(
        EXPANDERS.some((e) => cited.includes(e)),
        "the memo must cite at least one expander",
      );
      ok(typeof memo?.["headline"] === "string", "the memo must carry a headline");
      const synthRec = lastReceipt(dag.ledger, SYNTHESIZER);
      ok(synthRec);
      ok(
        synthRec.input_fingerprints.length >= SCOUTS.length,
        "the synthesizer must consume the wide upstream fan-in",
      );

      // The terminal auditor woke + committed.
      ok(woke(r, AUDITOR), "the terminal auditor must wake");

      // Snapshot render tallies; every node ran at least once on the cold cascade.
      const countsAfterFirst = { ...renderCounts };
      for (const s of NODE_SPECS) {
        ok(
          (countsAfterFirst[s.id] ?? 0) >= 1,
          `${s.id} must have rendered live at least once on the cold cascade`,
        );
      }

      // (e) NO-CHANGE RE-RUN: re-stage the IDENTICAL inbox (unmoved `inbox` facet)
      // and re-wake the gateway. The gateway memo-skips; a skip propagates nothing,
      // so NO downstream node wakes — and NO render body runs (zero model calls).
      stageInbox(store, dag.ledger, inbox);
      const again = await dag.ingestAsync(GATEWAY);

      equal(
        dispositionOf(again, GATEWAY),
        "skipped",
        "the gateway must memo-skip on an unmoved inbox (zero model calls)",
      );
      for (const s of NODE_SPECS) {
        if (s.id === GATEWAY) continue;
        ok(!woke(again, s.id), `${s.id} must not wake on a no-change re-run`);
      }
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
