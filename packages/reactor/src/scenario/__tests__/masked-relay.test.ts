// IT-2 — Masked Relay, scaled (the upstream-read + read-isolation stress test).
// Source: tests/masked-relay.md; INTEGRATION-TESTS-PLAN.md §3 IT-2.
//
// The OFFLINE layer (this file) drives the ~10-node masked-relay topology through
// the REAL reconciler with DETERMINISTIC FAKE renders — zero model calls — and is
// the green bar that gates the commit. Its live sibling (`masked-relay.live.test.ts`)
// boots the SAME shapes with real renders.
//
//   Signal Inbox → Signal Ledger → 3 Scouts (peer-blind) → Viewport Masker
//     → 2 Expanders (each a different masked view) → 2 Critics → Synthesizer → Auditor
//
// The assertions cover IT-2's distinctive mechanics:
//   - peer blindness: a scout's resolved inbound edges EXCLUDE its siblings, and the
//     read-isolation pin REJECTS a scout's wm_read_upstream(sibling) — the pin and
//     the topology agree.
//   - partial visibility: an expander subscribes to ONLY its assigned masked-view
//     facet; the pin rejects a read of the OTHER expander / the OTHER view producer.
//   - deterministic mask seed: same seed ⇒ identical visible/hidden set ⇒ replay.
//   - receipt propagation: an expander wakes ONLY when ITS masked view changes.
//   - memo-skip: an unchanged source ⇒ no new renders beyond cheap no-change receipts.
//   - full provenance: the synthesizer's memo names which upstream receipts changed.

import { deepEqual, equal, match, notEqual, ok } from "node:assert/strict";
import { test } from "node:test";

import { RunContext, type FunctionTool } from "@openai/agents";

import { ATOMIC_FACET } from "../../shapes";
import {
  wmReadUpstreamTool,
  type AgentRenderContext,
} from "../../adapters/agent-render/tools";
import {
  AUDITOR,
  CRITICS,
  EXPANDER_1,
  EXPANDER_2,
  EXPANDERS,
  GATEWAY,
  MASK_SEED,
  SCOUTS,
  SCOUT_FRICTION,
  SCOUT_PRICE,
  SIGNAL_LEDGER,
  SYNTHESIZER,
  VIEWPORT_MASKER,
  VIEW_E1,
  VIEW_E2,
  deliverSignal,
  isVisible,
  maskedRelayScenario,
  maskerCanon,
  reWakeUnchanged,
  readJson,
  type MaskedView,
  type Signal,
} from "../masked-relay";
import {
  countDisposition,
  dispositionOf,
  facetFingerprint,
  lastReceipt,
  woke,
} from "../trace";
import { files, jsonFile } from "../../world-model";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SIG_A: Signal = { id: "s1", source: "customer_call", text: "too expensive" };
const SIG_B: Signal = { id: "s2", source: "support_ticket", text: "slow export" };
const SIG_C: Signal = { id: "s3", source: "competitor", text: "rival shipped X" };

/**
 * Resolve a node's actual upstream subscriptions FROM the mounted topology edges —
 * exactly the tuple the live harness threads into `AgentRenderContext.upstream`
 * (index.ts: `ctx.inbound_edges.map(...)`). So a pin assertion built from this is
 * the SAME read-isolation the live render enforces.
 */
function upstreamOf(
  scn: ReturnType<typeof maskedRelayScenario>,
  node: string,
): { producer: string; facet: string }[] {
  return scn.topology.topology.edges
    .filter((e) => e.subscriber === node)
    .map((e) => ({ producer: e.producer, facet: e.facet }));
}

/** Drive the read-isolation pin exactly as the SDK runner does. */
async function invokeUpstreamRead(
  context: AgentRenderContext,
  producer: string,
  path: string,
): Promise<string> {
  const fn = wmReadUpstreamTool() as unknown as FunctionTool<AgentRenderContext>;
  const runContext = new RunContext<AgentRenderContext>(context);
  const result = await fn.invoke(runContext, JSON.stringify({ producer, path }));
  return typeof result === "string" ? result : String(result);
}

// ---------------------------------------------------------------------------
// Inventory — the topology mounted as specified
// ---------------------------------------------------------------------------

test("IT-2 inventory: ~10 nodes, one gateway entry point, acyclic relay", () => {
  const scn = maskedRelayScenario();
  const nodeIds = scn.topology.topology.nodes.map((n) => n.node);
  // 1 gateway + 1 ledger + 3 scouts + 1 masker + 2 expanders + 2 critics + 1 synth + 1 auditor
  equal(nodeIds.length, 12);
  deepEqual(scn.topology.topology.entry_points, [GATEWAY]);
  equal(scn.topology.topology.acyclic, true);
});

// ---------------------------------------------------------------------------
// Peer blindness — the read-isolation pin agrees with the topology
// ---------------------------------------------------------------------------

test("IT-2 peer blindness: a scout subscribes to NO sibling; the pin REJECTS wm_read_upstream(sibling)", async () => {
  const scn = maskedRelayScenario();
  deliverSignal(scn, SIG_A);
  deliverSignal(scn, SIG_B); // give the scouts real published truth to (not) leak

  // Each scout's resolved inbound edges are exactly { Signal Ledger } — no sibling.
  for (const scout of SCOUTS) {
    const up = upstreamOf(scn, scout);
    deepEqual(
      up.map((u) => u.producer).sort(),
      [SIGNAL_LEDGER],
      `${scout} must subscribe ONLY to the Signal Ledger (peer-blind)`,
    );
  }

  // The pin, built from price's REAL subscriptions, rejects reading a sibling —
  // even though the sibling has real published truth in the same store.
  const priceCtx: AgentRenderContext = {
    node: SCOUT_PRICE,
    store: scn.store,
    upstream: upstreamOf(scn, SCOUT_PRICE),
  };
  const frictionTruth = readJson(scn.store, SCOUT_FRICTION);
  ok(frictionTruth, "the friction scout must have committed truth to (not) leak");

  const out = await invokeUpstreamRead(priceCtx, SCOUT_FRICTION, "truth.json");
  match(out, /not subscribed/i);
  // The sibling's claims are NEVER returned through the pin.
  ok(!out.includes("friction:"), `leaked a sibling scout's truth: ${out}`);

  // And the ledger (a real subscription) IS readable through the very same pin.
  const okRead = await invokeUpstreamRead(priceCtx, SIGNAL_LEDGER, "truth.json");
  ok(okRead.includes("dedupe_key"), "the scout must be able to read its ledger");
});

// ---------------------------------------------------------------------------
// Partial visibility — an expander reads ONLY its assigned masked view
// ---------------------------------------------------------------------------

test("IT-2 partial visibility: an expander subscribes ONLY to its masked-view facet; the pin rejects the peer expander + the other view", async () => {
  const scn = maskedRelayScenario();
  deliverSignal(scn, SIG_A);
  deliverSignal(scn, SIG_B);

  // Expander 1's inbound edges: the masker's `view_e1` facet + the ledger. NOT the
  // other expander, NOT the masker's `view_e2`.
  const e1Up = upstreamOf(scn, EXPANDER_1);
  const e1Facets = e1Up
    .filter((u) => u.producer === VIEWPORT_MASKER)
    .map((u) => u.facet);
  deepEqual(e1Facets, [VIEW_E1], "Expander 1 must subscribe ONLY to view_e1");
  ok(
    !e1Up.some((u) => u.producer === EXPANDER_2),
    "Expander 1 must NOT subscribe to the peer expander",
  );

  // The pin rejects reading the peer expander (partial visibility / peer blindness).
  const e1Ctx: AgentRenderContext = {
    node: EXPANDER_1,
    store: scn.store,
    upstream: e1Up,
  };
  const peer = await invokeUpstreamRead(e1Ctx, EXPANDER_2, "truth.json");
  match(peer, /not subscribed/i);

  // The masker IS a subscribed producer, so the expander reads the masker truth —
  // but its own render only consumes ITS slot's visible set (asserted below).
  const maskRead = await invokeUpstreamRead(e1Ctx, VIEWPORT_MASKER, "truth.json");
  ok(maskRead.includes("views"), "the expander must read the masker truth");

  // Each expander's committed truth reflects ONLY its own slot's visible set.
  const mask = readJson(scn.store, VIEWPORT_MASKER);
  const views = (mask?.["views"] ?? {}) as Record<string, MaskedView>;
  for (const exp of EXPANDERS) {
    const e = readJson(scn.store, exp);
    equal(
      e?.["visible_count"],
      views[exp]!.visible.length,
      `${exp} must expand exactly its own visible set`,
    );
  }
});

// ---------------------------------------------------------------------------
// Deterministic mask seed — replay-stable; a seed change re-masks
// ---------------------------------------------------------------------------

test("IT-2 deterministic mask seed: same seed ⇒ identical visible/hidden set ⇒ replay; a seed change re-masks", () => {
  // The masker canonicalizer over a fixed views object is stable across runs.
  const claimIds = ["price:s1", "friction:s1", "desire:s1", "price:s2"];
  const buildViews = (seed: number) => {
    const views: Record<string, { visible: string[]; hidden_hashes: string[] }> = {};
    for (const consumer of EXPANDERS) {
      const visible = claimIds.filter((id) => isVisible(seed, consumer, id)).sort();
      views[consumer] = { visible, hidden_hashes: [] };
    }
    return views;
  };

  const fm1 = files({ "truth.json": jsonFile({ views: buildViews(MASK_SEED) }) });
  const fm2 = files({ "truth.json": jsonFile({ views: buildViews(MASK_SEED) }) });
  // Same seed ⇒ identical masked-view facet tokens (the run replays).
  equal(maskerCanon(fm1)[VIEW_E1], maskerCanon(fm2)[VIEW_E1]);
  equal(maskerCanon(fm1)[VIEW_E2], maskerCanon(fm2)[VIEW_E2]);

  // A DIFFERENT seed produces a different split (so at least one view facet moves).
  const fmAlt = files({ "truth.json": jsonFile({ views: buildViews(MASK_SEED + 1) }) });
  const moved =
    maskerCanon(fm1)[VIEW_E1] !== maskerCanon(fmAlt)[VIEW_E1] ||
    maskerCanon(fm1)[VIEW_E2] !== maskerCanon(fmAlt)[VIEW_E2];
  ok(moved, "a seed change must move at least one masked-view facet (re-masks)");

  // The two consumers get DIFFERENT visible sets under the same seed (real masking,
  // not a pass-through) — otherwise "partial visibility" would be vacuous.
  const v1 = buildViews(MASK_SEED)[EXPANDER_1]!.visible;
  const v2 = buildViews(MASK_SEED)[EXPANDER_2]!.visible;
  notEqual(JSON.stringify(v1), JSON.stringify(v2));
});

test("IT-2 deterministic replay: two identical signal runs ⇒ identical world-model fingerprints", () => {
  const run = () => {
    const scn = maskedRelayScenario();
    deliverSignal(scn, SIG_A);
    deliverSignal(scn, SIG_B);
    deliverSignal(scn, SIG_C);
    return [
      GATEWAY,
      SIGNAL_LEDGER,
      ...SCOUTS,
      VIEWPORT_MASKER,
      ...EXPANDERS,
      ...CRITICS,
      SYNTHESIZER,
      AUDITOR,
    ].map((n) => [n, lastReceipt(scn.ledger, n)?.fingerprints[ATOMIC_FACET]]);
  };
  deepEqual(run(), run());
});

// ---------------------------------------------------------------------------
// Receipt propagation — the relay flows; the diamond at the synthesizer is one wake
// ---------------------------------------------------------------------------

test("IT-2 receipt propagation: a new signal wakes the whole relay; the same-depth scout fan-in reconverges to ONE masker render", () => {
  const scn = maskedRelayScenario();
  deliverSignal(scn, SIG_A); // cold cascade
  const r = deliverSignal(scn, SIG_B); // a real second signal moves the ledger

  // The gateway, ledger and every scout each render exactly once on a moved ledger.
  for (const n of [GATEWAY, SIGNAL_LEDGER, ...SCOUTS]) {
    equal(countDisposition(r, n, "rendered"), 1, `${n} rendered once`);
  }
  // The Viewport Masker is a TRUE same-depth diamond fan-in: all THREE scouts sit
  // at the same DAG depth (each ⊂ the ledger) and move in one wave, so the masker
  // reconverges to a SINGLE render, not one-per-scout. (The later two scout wakes
  // find the masker's inputs already consumed → cheap skips, never a re-render.)
  equal(
    countDisposition(r, VIEWPORT_MASKER, "rendered"),
    1,
    "the masker must render exactly once for the 3-scout fan-in tuple",
  );

  // The synthesizer is a CROSS-DEPTH fan-in (scouts at depth 3, expanders at depth
  // 5, critics at depth 6): it is woken by successive waves as each stage commits,
  // so it renders MORE than once — and its LAST render sees the FULL trail (every
  // upstream producer published). That final memo is the full-provenance commit.
  ok(
    countDisposition(r, SYNTHESIZER, "rendered") >= 1,
    "the synthesizer must render at least once across the relay's waves",
  );
  const memo = readJson(scn.store, SYNTHESIZER);
  const cited = (memo?.["evidence_refs"] ?? []) as string[];
  for (const up of [...SCOUTS, ...EXPANDERS, ...CRITICS]) {
    ok(
      cited.includes(up),
      `the synthesizer's FINAL memo must cite the full trail (missing ${up})`,
    );
  }
  // The terminal auditor woke after the memo changed.
  ok(woke(r, AUDITOR));
});

test("IT-2 selective wake: an expander wakes ONLY when ITS masked view changes (one view moves, the peer stays asleep)", () => {
  // The expanders subscribe to ONLY their own masked-view facet — never the ledger
  // atomic — so "wakes iff its view moved" is an honest fingerprint fact, not a
  // confound. Drive a signal (deterministically chosen) whose new scout claims move
  // EXACTLY ONE expander's masked view: Expander 1's view moves, Expander 2's does
  // not. The selective-wake guarantee then has real teeth — the peer must NOT wake.
  const scn = maskedRelayScenario();
  deliverSignal(scn, SIG_A);
  deliverSignal(scn, SIG_B);

  const beforeE1 = facetFingerprint(scn.ledger, VIEWPORT_MASKER, VIEW_E1);
  const beforeE2 = facetFingerprint(scn.ledger, VIEWPORT_MASKER, VIEW_E2);
  const e2RendersBefore = scn.deps.renders[EXPANDER_2] ?? 0;

  // Signal id `sc` (after s1,s2) is the deterministic case where ONLY view_e1 moves
  // under the mask's stable split — verified against the fixture's `isVisible`.
  const r = deliverSignal(scn, { id: "sc", source: "lost_deal", text: "went rival" });

  const e1Moved =
    facetFingerprint(scn.ledger, VIEWPORT_MASKER, VIEW_E1) !== beforeE1;
  const e2Moved =
    facetFingerprint(scn.ledger, VIEWPORT_MASKER, VIEW_E2) !== beforeE2;
  // Precondition: exactly one view moved (the single-view case this test needs).
  equal(e1Moved, true, "fixture invariant: signal `sc` must move Expander 1's view");
  equal(e2Moved, false, "fixture invariant: signal `sc` must NOT move Expander 2's view");

  // The moved view wakes ITS expander; the unmoved view leaves the peer ASLEEP.
  ok(woke(r, EXPANDER_1), "Expander 1 must wake — its masked view moved");
  equal(countDisposition(r, EXPANDER_1, "rendered"), 1, "Expander 1 must render once");
  ok(
    !woke(r, EXPANDER_2),
    "Expander 2 must NOT wake — its masked view is unmoved (selective wake)",
  );
  equal(
    scn.deps.renders[EXPANDER_2] ?? 0,
    e2RendersBefore,
    "Expander 2's render body must NOT run when its view is unmoved",
  );
});

// ---------------------------------------------------------------------------
// Memo-skip — an unchanged source produces no new renders
// ---------------------------------------------------------------------------

test("IT-2 memo-skip: an unchanged source ⇒ the gateway skips, nothing downstream wakes, zero renders", () => {
  const scn = maskedRelayScenario();
  deliverSignal(scn, SIG_A);
  deliverSignal(scn, SIG_B);

  const rendersBefore = { ...scn.deps.renders };

  // Re-wake the gateway with the IDENTICAL inbox (no new signal): the inbox facet
  // is unmoved, so the gateway's memo key does not move.
  const again = reWakeUnchanged(scn);

  equal(
    dispositionOf(again, GATEWAY),
    "skipped",
    "the gateway must memo-skip on an unmoved inbox",
  );
  // A skip propagates nothing — no downstream node wakes at all.
  for (const n of [
    SIGNAL_LEDGER,
    ...SCOUTS,
    VIEWPORT_MASKER,
    ...EXPANDERS,
    ...CRITICS,
    SYNTHESIZER,
    AUDITOR,
  ]) {
    ok(!woke(again, n), `${n} must not wake on a no-change re-delivery`);
  }
  // Zero new renders anywhere (the render bodies never ran).
  deepEqual(scn.deps.renders, rendersBefore);
});

// ---------------------------------------------------------------------------
// Full provenance — the synthesizer names which upstream receipts changed
// ---------------------------------------------------------------------------

test("IT-2 full provenance: the synthesizer memo cites every upstream ledger and names the consumed input fingerprints", () => {
  const scn = maskedRelayScenario();
  deliverSignal(scn, SIG_A);
  deliverSignal(scn, SIG_B);

  const memo = readJson(scn.store, SYNTHESIZER);
  ok(memo, "the synthesizer must have committed an InsightMemo");

  // It cites every upstream producer it read (scouts + expanders + critics).
  const cited = (memo["evidence_refs"] ?? []) as string[];
  for (const up of [...SCOUTS, ...EXPANDERS, ...CRITICS]) {
    ok(cited.includes(up), `the memo must cite upstream ${up}`);
  }

  // `changed_since_last` carries the receipt's consumed input fingerprints — the
  // full-provenance trail (which upstream receipts the memo saw move).
  const changed = (memo["changed_since_last"] ?? []) as string[];
  const rec = lastReceipt(scn.ledger, SYNTHESIZER);
  ok(rec);
  deepEqual(
    changed,
    rec.input_fingerprints.slice(),
    "the memo's changed_since_last must equal the receipt's consumed input fingerprints",
  );
  // A wide fan-in: the synthesizer consumed multiple upstream fingerprints.
  ok(
    rec.input_fingerprints.length >= SCOUTS.length,
    "the synthesizer must consume the full upstream receipt set",
  );
});
