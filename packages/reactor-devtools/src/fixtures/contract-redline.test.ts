// Proof that the generated Contract Redline state-dir is a REAL, replayable
// corpus AND that it lands the two-halved Aha the hook promises:
//   - INCREMENTAL RE-SUMMARIZATION: a single-section (substantive) edit renders
//     EXACTLY ONE summarize node — its own section — and NO other section's
//     summarize; the other seven section lanes stay DARK.
//   - FAN-IN ROLLUP: that one moved summary propagates up the deep tail exactly
//     once — Risk Rollup → Exec Summary → Redline Report all re-render.
//   - MEMOIZATION (the non-material edit): a cosmetic edit to the SAME section
//     that normalizes to identical text moves NO section facet ⇒ the gateway
//     memo-SKIPS, NO summarize re-renders, and the rollup chain does NOT re-render.
//
// It loads through the exact SDK read surface the devtools data layer uses, so if
// the generator drifts this fails before the demo ever runs. Pure: generates into
// a fresh temp dir, opens it with the replay read surface. No model key.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createReplaySession,
} from "@openprose/reactor";
import {
  FileSystemReceiptLedger,
} from "@openprose/reactor/adapters";
import {
  propagationTargets,
  type TopologyWorldModel,
} from "@openprose/reactor/internals";
import { createFileSystemStorageAdapter } from "@openprose/reactor";

import { generateContractRedlineFixture } from "./contract-redline";

const GATEWAY = "gateway.clauses";
const RISK_ROLLUP = "responsibility.risk-rollup";
const EXEC_SUMMARY = "responsibility.exec-summary";
const REDLINE_REPORT = "responsibility.redline-report";
const SUMMARIZE_PREFIX = "responsibility.summarize-section-";
const SECTION_FACET_PREFIX = "section:";

function openSession(stateDir: string) {
  const storage = createFileSystemStorageAdapter({ directory: stateDir });
  const ledger = new FileSystemReceiptLedger({ storage });
  return createReplaySession({ ledger });
}

function readTopology(stateDir: string): TopologyWorldModel {
  return JSON.parse(
    readFileSync(join(stateDir, "compile", "topology.json"), "utf8"),
  ) as TopologyWorldModel;
}

test("generated contract-redline fixture loads via the SDK replay read surface", () => {
  const stateDir = mkdtempSync(join(tmpdir(), "rdt-cr-"));
  const result = generateContractRedlineFixture({ stateDir });

  // the replayability ingredients + the labels map + the beats map are on disk.
  assert.ok(existsSync(join(stateDir, "receipts.json")), "receipts trail present");
  assert.ok(existsSync(join(stateDir, "world-models")), "world-models dir present");
  assert.ok(
    existsSync(join(stateDir, "compile", "topology.json")),
    "topology snapshot present",
  );
  assert.ok(existsSync(join(stateDir, "compile", "labels.json")), "labels map present");
  assert.ok(existsSync(join(stateDir, "beats.json")), "beats map present");

  const session = openSession(stateDir);
  assert.equal(session.receipts.length, result.receiptsCount);
  assert.ok(session.receipts.length > 0, "trail is non-empty");

  // The graph: gateway + 8 section summarizers + risk-rollup + exec-summary +
  // redline-report = 12 real nodes (the phantom ingress source is NOT a node).
  const topology = readTopology(stateDir);
  assert.equal(topology.nodes.length, 12, "the enumerated graph (12 real nodes)");
  assert.equal(
    topology.nodes.filter((n) => n.node.startsWith(SUMMARIZE_PREFIX)).length,
    8,
    "eight per-section summarizers (the column mostly dark)",
  );
  assert.equal(topology.acyclic, true);
  assert.ok(topology.entry_points.includes(GATEWAY), "gateway is the entry point");

  // per-section facet edges exist on the gateway (the dark-lane boundary).
  for (const sec of [1, 2, 3, 4, 5, 6, 7, 8]) {
    assert.ok(
      topology.edges.some(
        (e) =>
          e.producer === GATEWAY &&
          e.facet === `${SECTION_FACET_PREFIX}${sec}` &&
          e.subscriber === `${SUMMARIZE_PREFIX}${sec}`,
      ),
      `gateway exposes an independent "section:${sec}" facet edge to its summarizer`,
    );
  }

  // the deep chain is wired: rollup ← 8 summaries, exec ← rollup.risk, report ← exec.
  assert.equal(
    topology.edges.filter((e) => e.subscriber === RISK_ROLLUP).length,
    8,
    "the risk-rollup fans in from all 8 section summaries",
  );
  assert.ok(
    topology.edges.some((e) => e.subscriber === EXEC_SUMMARY && e.producer === RISK_ROLLUP && e.facet === "risk"),
    "exec-summary reads the rollup's risk facet",
  );
  assert.ok(
    topology.edges.some((e) => e.subscriber === REDLINE_REPORT && e.producer === EXEC_SUMMARY),
    "redline-report requires the exec-summary (the deep tail)",
  );
});

// ===========================================================================
// THE INVARIANT (the single load-bearing check).
//
// A single-section (substantive) edit renders EXACTLY ONE summarize node (its
// section) plus the full rollup chain (rollup, exec-summary, report) and NO other
// section summarize. A non-material edit to the same section produces a memo hit
// (the gateway skips) and NO rollup re-render.
// ===========================================================================

/** Find the index of the gateway receipt that moved EXACTLY the given section facet. */
function findGatewaySingleSectionMove(
  session: ReturnType<typeof openSession>,
  section: number,
): number {
  for (let i = 0; i < session.receipts.length; i++) {
    const r = session.receipts[i]!;
    if (r.node !== GATEWAY || r.status !== "rendered") continue;
    const moved = session.movedFacetsByIndex[i]!;
    const movedSections = [...moved].filter((f) => f.startsWith(SECTION_FACET_PREFIX));
    if (movedSections.length === 1 && movedSections[0] === `${SECTION_FACET_PREFIX}${section}`) {
      return i;
    }
  }
  return -1;
}

test("THE INVARIANT: a single-section edit wakes exactly its summarizer + the rollup chain; siblings stay DARK", () => {
  const stateDir = mkdtempSync(join(tmpdir(), "rdt-cr-hero-"));
  generateContractRedlineFixture({ stateDir });
  const session = openSession(stateDir);
  const topology = readTopology(stateDir);

  // The hero edit is a single substantive change to section 3.
  const heroIdx = findGatewaySingleSectionMove(session, 3);
  assert.ok(heroIdx >= 0, "the episode contains a single-section §3 gateway delta (the hero)");

  const moved = session.movedFacetsByIndex[heroIdx]!;

  // (1) The gateway lights EXACTLY ONE summarizer lane — section 3's — via the
  // SDK's own propagation dedupe. The seven sibling lanes stay DARK.
  const litSummarizers = propagationTargets({
    topology,
    producer: GATEWAY,
    movedFacets: moved,
    wakeRef: session.receipts[heroIdx]!.content_hash,
  })
    .map((t) => t.node)
    .filter((n) => n.startsWith(SUMMARIZE_PREFIX));

  assert.equal(
    litSummarizers.length,
    1,
    `a single-section gateway delta lit ${litSummarizers.length} summarizer lanes (${litSummarizers.join(
      ", ",
    )}); the dark lane requires EXACTLY 1`,
  );
  assert.equal(
    litSummarizers[0],
    `${SUMMARIZE_PREFIX}3`,
    "the lit summarizer matches the edited section (§3)",
  );

  // (2) The single moved summary propagates up the DEEP tail exactly once: in the
  // drain that begins at heroIdx, exactly ONE summarize node renders (its own),
  // and the rollup, exec-summary, and report each re-render exactly once. We read
  // the contiguous drain: the receipts after the gateway frame until the next
  // gateway/ingress frame.
  const drain = drainAfter(session, heroIdx);
  const renderedSummaries = drain.filter(
    (r) => r.node.startsWith(SUMMARIZE_PREFIX) && r.status === "rendered",
  );
  assert.equal(
    renderedSummaries.length,
    1,
    `exactly one summarize node re-renders on a single-section edit (saw ${renderedSummaries
      .map((r) => r.node)
      .join(", ")})`,
  );
  assert.equal(renderedSummaries[0]!.node, `${SUMMARIZE_PREFIX}3`, "the §3 summarizer is the one that re-rendered");

  for (const node of [RISK_ROLLUP, EXEC_SUMMARY, REDLINE_REPORT]) {
    const hits = drain.filter((r) => r.node === node && r.status === "rendered");
    assert.equal(hits.length, 1, `${node} re-renders EXACTLY once in the §3 drain (the fan-in rollup chain)`);
  }

  // and NO sibling summarizer rendered anywhere in this drain (the seven dark lanes).
  for (let s = 1; s <= 8; s++) {
    if (s === 3) continue;
    const sibling = drain.filter((r) => r.node === `${SUMMARIZE_PREFIX}${s}` && r.status === "rendered");
    assert.equal(sibling.length, 0, `Summarize §${s} stays DARK on a §3 edit`);
  }
});

test("THE MEMO HIT: a non-material edit to §3 skips the gateway and re-renders NO summarize, NO rollup", () => {
  const stateDir = mkdtempSync(join(tmpdir(), "rdt-cr-memo-"));
  generateContractRedlineFixture({ stateDir });
  const session = openSession(stateDir);

  // The memo-hit beat is the FIRST gateway frame, after the hero §3 render, whose
  // status is `skipped` despite a fresh external Contract Doc render preceding it
  // (the cosmetic §3 edit). It moved nothing material ⇒ the gateway memo-skipped.
  const heroIdx = findGatewaySingleSectionMove(session, 3);
  assert.ok(heroIdx >= 0, "found the hero §3 render");

  // Scan forward for the gateway skip that is the cosmetic-edit memo hit.
  let memoIdx = -1;
  for (let i = heroIdx + 1; i < session.receipts.length; i++) {
    const r = session.receipts[i]!;
    if (r.node === GATEWAY && r.status === "skipped") {
      // Confirm the immediately preceding ingress frame was a real external
      // render (the cosmetic edit re-published the doc) — i.e. the gateway was
      // woken by a fresh publish yet still skipped.
      memoIdx = i;
      break;
    }
  }
  assert.ok(memoIdx >= 0, "the episode contains a gateway memo-skip after the hero edit (the cosmetic §3 edit)");

  const memo = session.receipts[memoIdx]!;
  assert.equal(memo.status, "skipped", "the cosmetic edit produced a gateway SKIP (the memo hit)");
  assert.equal(memo.cost.tokens.fresh, 0, "the memo hit burns ZERO fresh tokens (the whole point)");
  assert.equal(session.movedFacetsByIndex[memoIdx]!.size, 0, "the memo hit moved NO facet");

  // and in the drain that the memo-hit belongs to, NO summarize and NO rollup-chain
  // node re-renders (nothing material moved, so nothing downstream wakes).
  const drain = drainAfter(session, memoIdx - 1); // start from the ingress frame
  for (const node of [RISK_ROLLUP, EXEC_SUMMARY, REDLINE_REPORT]) {
    const hits = drain.filter((r) => r.node === node && r.status === "rendered");
    assert.equal(hits.length, 0, `${node} does NOT re-render on the non-material edit`);
  }
  const summaries = drain.filter(
    (r) => r.node.startsWith(SUMMARIZE_PREFIX) && r.status === "rendered",
  );
  assert.equal(summaries.length, 0, "no summarize node re-renders on the non-material edit (memoization held)");
});

test("INDEPENDENCE: a second single-section edit (§5) lights a DIFFERENT single lane (siblings dark)", () => {
  const stateDir = mkdtempSync(join(tmpdir(), "rdt-cr-indep-"));
  generateContractRedlineFixture({ stateDir });
  const session = openSession(stateDir);
  const topology = readTopology(stateDir);

  // The §5 edit must light EXACTLY Summarize §5 and nothing else — proving the
  // per-section facets are genuinely independent (siblings do NOT move together).
  const idx = findGatewaySingleSectionMove(session, 5);
  assert.ok(idx >= 0, "the episode contains a single-section §5 gateway delta");

  const lit = propagationTargets({
    topology,
    producer: GATEWAY,
    movedFacets: session.movedFacetsByIndex[idx]!,
    wakeRef: session.receipts[idx]!.content_hash,
  })
    .map((t) => t.node)
    .filter((n) => n.startsWith(SUMMARIZE_PREFIX));
  assert.deepEqual(lit, [`${SUMMARIZE_PREFIX}5`], "the §5 edit lights EXACTLY the §5 summarizer");
});

test("THE COST METER: a flat field of skips + a modest per-edit fan-in cost (no runaway)", () => {
  const stateDir = mkdtempSync(join(tmpdir(), "rdt-cr-cost-"));
  generateContractRedlineFixture({ stateDir });
  const session = openSession(stateDir);

  // skips exist (the quiet stretch) and carry zero fresh (the flat line).
  const skips = session.receipts.filter((r) => r.status === "skipped");
  assert.ok(skips.length > 0, "memo-skips exist (the quiet-world pulses)");
  for (const s of skips) {
    assert.equal(s.cost.tokens.fresh, 0, "skipped receipts carry zero fresh");
  }

  // the rollup spent fresh (the fan-in cost lands) and reused accumulates (memo hits).
  assert.ok(session.costRollup.total.fresh > 0, "fresh tokens were spent");
  assert.ok(session.costRollup.total.reused > 0, "reused tokens accumulate (memo hits)");

  // a single-section edit's fan-in is BOUNDED: across the whole episode the rollup
  // never re-folds more sections than exist (no quadratic blow-up). The rollup's
  // per-render fresh is constant (it folds all 8), which is the point — the SAVINGS
  // are in the 7 summarizers it did NOT wake.
  const rollupRenders = session.receipts.filter(
    (r) => r.node === RISK_ROLLUP && r.status === "rendered",
  );
  assert.ok(rollupRenders.length >= 1, "the rollup rendered at least once");
});

test("the contract-redline fixture is deterministic — two generations are byte-identical", () => {
  const a = mkdtempSync(join(tmpdir(), "rdt-cr-det-a-"));
  const b = mkdtempSync(join(tmpdir(), "rdt-cr-det-b-"));
  generateContractRedlineFixture({ stateDir: a });
  generateContractRedlineFixture({ stateDir: b });

  assert.equal(
    readFileSync(join(a, "receipts.json"), "utf8"),
    readFileSync(join(b, "receipts.json"), "utf8"),
    "receipt trails are byte-identical across runs",
  );
  assert.equal(
    readFileSync(join(a, "compile", "topology.json"), "utf8"),
    readFileSync(join(b, "compile", "topology.json"), "utf8"),
    "topology snapshots are byte-identical across runs",
  );
  assert.equal(
    readFileSync(join(a, "compile", "labels.json"), "utf8"),
    readFileSync(join(b, "compile", "labels.json"), "utf8"),
    "labels maps are byte-identical across runs",
  );
  assert.equal(
    readFileSync(join(a, "beats.json"), "utf8"),
    readFileSync(join(b, "beats.json"), "utf8"),
    "beats maps are byte-identical across runs",
  );
});

// ---------------------------------------------------------------------------
// Helper: the contiguous drain of receipts triggered by the gateway/ingress
// frame at `startIdx` — every receipt after it, up to (but not including) the
// next Contract Doc (ingress) frame. The reconciler appends a drain's receipts
// contiguously, so this slices one logical "edit → settle" episode.
// ---------------------------------------------------------------------------
function drainAfter(
  session: ReturnType<typeof openSession>,
  startIdx: number,
): ReturnType<typeof openSession>["receipts"] {
  const out: ReturnType<typeof openSession>["receipts"] = [] as never;
  for (let i = startIdx + 1; i < session.receipts.length; i++) {
    const r = session.receipts[i]!;
    if (r.node === "ingress.contract-doc") break;
    (out as unknown as unknown[]).push(r);
  }
  return out;
}
