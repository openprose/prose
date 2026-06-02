// Proof that the generated Research Tree state-dir is a REAL, replayable corpus
// AND that it lands THE Aha: partial propagation UP a tree. The single load-
// bearing invariant — revising ONE leaf finding three levels down wakes ONLY the
// nodes on its ancestor path to the root (the finding, its sub-synthesis, the
// root), bounded by tree DEPTH; the sibling subtrees' findings and sub-syntheses
// stay skipped; and two different leaf revisions light two DIFFERENT sub-
// synthesis nodes but the SAME root.
//
// It loads through the exact SDK read surface the devtools data layer uses, so
// if the generator drifts this fails before the demo ever runs. Pure: generates
// into a fresh temp dir, opens it with the replay read surface. No model key.

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

import { generateResearchTreeFixture } from "./research-tree";

const GATEWAY = "gateway.sources";
const ROOT = "synthesis.root";
const FINDING_PREFIX = "finding.";
const SUBSYNTH_PREFIX = "synthesis.sub-";

const SUB_OF_LEAF: Record<string, string> = {
  A1: "A", A2: "A", A3: "A",
  B1: "B", B2: "B", B3: "B",
  C1: "C", C2: "C",
};
const ALL_LEAVES = Object.keys(SUB_OF_LEAF);

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

test("generated research-tree fixture loads via the SDK replay read surface", () => {
  const stateDir = mkdtempSync(join(tmpdir(), "rdt-tree-"));
  const result = generateResearchTreeFixture({ stateDir });

  assert.ok(existsSync(join(stateDir, "receipts.json")), "receipts trail present");
  assert.ok(existsSync(join(stateDir, "world-models")), "world-models dir present");
  assert.ok(existsSync(join(stateDir, "compile", "topology.json")), "topology snapshot present");
  assert.ok(existsSync(join(stateDir, "compile", "labels.json")), "labels map present");

  const session = openSession(stateDir);
  assert.equal(session.receipts.length, result.receiptsCount);
  assert.ok(session.receipts.length > 0, "trail is non-empty");

  // The graph: gateway + 8 finding leaves + 3 sub-syntheses + root = 13 real
  // nodes (the phantom ingress corpus is NOT a topology node).
  const topology = readTopology(stateDir);
  assert.equal(topology.nodes.length, 13, "the enumerated tree (13 real nodes)");
  assert.equal(
    topology.nodes.filter((n) => n.node.startsWith(FINDING_PREFIX)).length,
    8,
    "eight finding leaves",
  );
  assert.equal(
    topology.nodes.filter((n) => n.node.startsWith(SUBSYNTH_PREFIX)).length,
    3,
    "three sub-syntheses",
  );
  assert.equal(topology.acyclic, true);
  assert.ok(topology.entry_points.includes(GATEWAY), "gateway is the entry point");

  // Per-leaf facet edges exist on the gateway (the dark-lane boundary): each
  // finding subscribes to ONLY its own `leaf:<id>` facet.
  for (const leaf of ALL_LEAVES) {
    assert.ok(
      topology.edges.some(
        (e) =>
          e.producer === GATEWAY &&
          e.facet === `leaf:${leaf}` &&
          e.subscriber === `${FINDING_PREFIX}${leaf}`,
      ),
      `gateway exposes an independent "leaf:${leaf}" facet edge to Finding ${leaf}`,
    );
  }

  // Propagation flows UP: leaf → sub-synthesis → root. Each finding feeds only
  // its own sub-synthesis; each sub-synthesis feeds the root.
  for (const leaf of ALL_LEAVES) {
    const sub = SUB_OF_LEAF[leaf]!;
    assert.ok(
      topology.edges.some(
        (e) => e.producer === `${FINDING_PREFIX}${leaf}` && e.subscriber === `${SUBSYNTH_PREFIX}${sub}`,
      ),
      `Finding ${leaf} feeds UP into Synthesis ${sub}`,
    );
  }
  for (const sub of ["A", "B", "C"]) {
    assert.ok(
      topology.edges.some(
        (e) => e.producer === `${SUBSYNTH_PREFIX}${sub}` && e.subscriber === ROOT,
      ),
      `Synthesis ${sub} feeds UP into the Root`,
    );
  }
});

// THE LOAD-BEARING INVARIANT.
//
// For every gateway frame that moved EXACTLY ONE leaf facet (a single-finding
// revision), the propagation must touch ONLY that finding's ancestor path: that
// finding, its OWN sub-synthesis, and the root — bounded by tree depth. Every
// sibling finding and every sibling sub-synthesis must stay dark.
test("THE ANCESTOR PATH: revising one leaf wakes only its finding → sub-synthesis → root", () => {
  const stateDir = mkdtempSync(join(tmpdir(), "rdt-tree-path-"));
  generateResearchTreeFixture({ stateDir });
  const session = openSession(stateDir);
  const topology = readTopology(stateDir);

  const leafFacets = new Set(ALL_LEAVES.map((l) => `leaf:${l}`));
  // record which sub-synthesis each single-leaf revision lit, keyed by leaf.
  const litSubByLeaf: Record<string, string> = {};
  let sawSingleLeafMove = false;

  for (let i = 0; i < session.receipts.length; i++) {
    const r = session.receipts[i]!;
    if (r.node !== GATEWAY || r.status !== "rendered") continue;
    const moved = session.movedFacetsByIndex[i]!;
    const movedLeaves = [...moved].filter((f) => leafFacets.has(f));
    if (movedLeaves.length !== 1) continue;
    sawSingleLeafMove = true;

    const leaf = movedLeaves[0]!.slice("leaf:".length);
    const sub = SUB_OF_LEAF[leaf]!;

    // 1) The gateway frame wakes EXACTLY the one touched finding lane.
    const gwTargets = propagationTargets({
      topology,
      producer: GATEWAY,
      movedFacets: moved,
      wakeRef: r.content_hash,
    });
    const litFindings = gwTargets.map((t) => t.node).filter((n) => n.startsWith(FINDING_PREFIX));
    assert.deepEqual(
      litFindings,
      [`${FINDING_PREFIX}${leaf}`],
      `a single-leaf gateway delta lit exactly Finding ${leaf}; siblings must stay dark`,
    );

    // 2) Trace the ancestor path forward from this gateway frame to the next
    //    gateway/source drain. Skip drains where the touched finding FAILED (the
    //    red-fail beat) — a failed finding wakes no ancestor by design and is
    //    asserted separately by THE RED SHOT.
    const drainReceipts: (typeof session.receipts)[number][] = [];
    for (let j = i + 1; j < session.receipts.length; j++) {
      const f = session.receipts[j]!;
      if (f.node === GATEWAY || f.node === "ingress.corpus") break; // next external drain
      drainReceipts.push(f);
    }
    const findingFailed = drainReceipts.some(
      (f) => f.node === `${FINDING_PREFIX}${leaf}` && f.status === "failed",
    );
    if (findingFailed) continue;

    // ONLY {finding, its sub-synthesis, root} rendered — bounded by tree depth
    // (3 levels) — and the touched sub-synthesis is the leaf's OWN sub.
    const drainRendered = new Set<string>();
    for (const f of drainReceipts) {
      if (f.status === "rendered") drainRendered.add(f.node);
    }
    // exactly the three ancestor-path nodes rendered (depth-bounded, not size).
    assert.deepEqual(
      [...drainRendered].sort(),
      [`${FINDING_PREFIX}${leaf}`, ROOT, `${SUBSYNTH_PREFIX}${sub}`].sort(),
      `revising ${leaf} rendered only its depth-bounded ancestor path (finding, Synthesis ${sub}, root)`,
    );
    // no sibling sub-synthesis rendered in this drain.
    for (const other of ["A", "B", "C"]) {
      if (other === sub) continue;
      assert.ok(
        !drainRendered.has(`${SUBSYNTH_PREFIX}${other}`),
        `sibling Synthesis ${other} stayed dark while ${leaf} (sub ${sub}) propagated`,
      );
    }
    litSubByLeaf[leaf] = sub;
  }

  assert.ok(sawSingleLeafMove, "the episode contains at least one single-leaf revision (the hero beat)");

  // TWO DIFFERENT LEAVES light TWO DIFFERENT sub-syntheses but the SAME root.
  // The hero beat revises B2 (sub B); a later beat revises A1 (sub A).
  assert.equal(litSubByLeaf["B2"], "B", "revising B2 lit Synthesis B");
  assert.equal(litSubByLeaf["A1"], "A", "revising A1 lit Synthesis A");
  assert.notEqual(
    litSubByLeaf["B2"],
    litSubByLeaf["A1"],
    "two different leaf revisions light two different sub-synthesis nodes",
  );
  // Both revisions re-rendered the same single Root node (the shared apex).
  const rootRenders = session.receipts.filter((r) => r.node === ROOT && r.status === "rendered");
  assert.ok(rootRenders.length >= 2, "the root re-synthesizes on each touched branch (same root, every time)");
});

test("THE DARK MASS: a single-leaf revision renders far fewer nodes than the tree", () => {
  const stateDir = mkdtempSync(join(tmpdir(), "rdt-tree-dark-"));
  generateResearchTreeFixture({ stateDir });
  const session = openSession(stateDir);

  // On the hero single-leaf drains, the count of rendered responsibility nodes
  // (finding + sub-synth + root = 3) is strictly less than the 12 non-gateway
  // nodes in the tree — the dark mass is real.
  let heroDrains = 0;
  for (let i = 0; i < session.receipts.length; i++) {
    const r = session.receipts[i]!;
    if (r.node !== GATEWAY || r.status !== "rendered") continue;
    const moved = session.movedFacetsByIndex[i]!;
    const movedLeaves = [...moved].filter((f) => f.startsWith("leaf:"));
    if (movedLeaves.length !== 1) continue;
    const leaf = movedLeaves[0]!.slice(5);
    let rendered = 0;
    let failed = false;
    for (let j = i + 1; j < session.receipts.length; j++) {
      const f = session.receipts[j]!;
      if (f.node === GATEWAY || f.node === "ingress.corpus") break;
      if (f.node === `${FINDING_PREFIX}${leaf}` && f.status === "failed") failed = true;
      if (f.status === "rendered") rendered += 1;
    }
    if (failed) continue; // the red-fail beat wakes no ancestor by design
    assert.equal(rendered, 3, "a single-leaf revision renders exactly its 3-node ancestor path");
    heroDrains += 1;
  }
  assert.ok(heroDrains >= 2, "at least two single-leaf hero drains in the episode");
});

test("THE CONVERGENCE: two leaves under one sub-question wake their sub-synthesis exactly once", () => {
  const stateDir = mkdtempSync(join(tmpdir(), "rdt-tree-conv-"));
  generateResearchTreeFixture({ stateDir });
  const session = openSession(stateDir);
  const topology = readTopology(stateDir);

  // The convergence beat: two B-leaves (B1, B3) move in one gateway drain. Both
  // findings render; Synthesis B is woken EXACTLY once (fan-in dedupe), not twice.
  let sawTwoLeafSameSub = false;
  for (let i = 0; i < session.receipts.length; i++) {
    const r = session.receipts[i]!;
    if (r.node !== GATEWAY || r.status !== "rendered") continue;
    const moved = session.movedFacetsByIndex[i]!;
    const movedLeaves = [...moved].filter((f) => f.startsWith("leaf:")).map((f) => f.slice(5));
    if (movedLeaves.length < 2) continue;
    const subs = new Set(movedLeaves.map((l) => SUB_OF_LEAF[l]!));
    if (subs.size !== 1) continue; // need two leaves under the SAME sub-question
    sawTwoLeafSameSub = true;

    // Both findings woken from the gateway frame, no dupes.
    const gwTargets = propagationTargets({
      topology,
      producer: GATEWAY,
      movedFacets: moved,
      wakeRef: r.content_hash,
    });
    const litFindings = gwTargets.map((t) => t.node).filter((n) => n.startsWith(FINDING_PREFIX));
    assert.equal(litFindings.length, movedLeaves.length, "each moved leaf lights its finding");
    assert.equal(new Set(litFindings).size, litFindings.length, "no finding lit twice");

    // The shared sub-synthesis rendered exactly once in this drain.
    const sub = [...subs][0]!;
    let subRenders = 0;
    for (let j = i + 1; j < session.receipts.length; j++) {
      const f = session.receipts[j]!;
      if (f.node === GATEWAY || f.node === "ingress.corpus") break;
      if (f.node === `${SUBSYNTH_PREFIX}${sub}` && f.status === "rendered") subRenders += 1;
    }
    assert.equal(subRenders, 1, `Synthesis ${sub} woken exactly once on a two-leaf convergent delta`);
  }
  assert.ok(sawTwoLeafSameSub, "the episode contains a two-leaf same-sub convergence drain");
});

test("THE RED SHOT: at least one `failed` receipt (a finding throws on a corrupt source)", () => {
  const stateDir = mkdtempSync(join(tmpdir(), "rdt-tree-fail-"));
  generateResearchTreeFixture({ stateDir });
  const session = openSession(stateDir);

  const failed = session.receipts.filter((r) => r.status === "failed");
  assert.ok(failed.length >= 1, "at least one failed receipt (the red shot)");
  assert.ok(
    failed.some((r) => r.node.startsWith(FINDING_PREFIX)),
    "a finding leaf is the node that failed",
  );
  for (const f of failed) {
    assert.equal(f.cost.tokens.fresh, 0, "failed receipts carry zero fresh");
  }
  // A failed finding propagates NOTHING up — no sub-synthesis or root renders in
  // the same drain as the failure.
  const failIdx = session.receipts.findIndex((r) => r.status === "failed");
  for (let j = failIdx + 1; j < session.receipts.length; j++) {
    const f = session.receipts[j]!;
    if (f.node === GATEWAY || f.node === "ingress.corpus") break;
    assert.ok(
      !(f.node.startsWith(SUBSYNTH_PREFIX) && f.status === "rendered") && !(f.node === ROOT && f.status === "rendered"),
      "a failed finding wakes no ancestor — prior synthesis stands",
    );
  }
});

test("THE AUDIT FLOOR: at least one `self` receipt (the self-tick)", () => {
  const stateDir = mkdtempSync(join(tmpdir(), "rdt-tree-self-"));
  generateResearchTreeFixture({ stateDir });
  const session = openSession(stateDir);

  const selfReceipts = session.receipts.filter((r) => r.wake.source === "self");
  assert.ok(selfReceipts.length >= 1, "at least one self-sourced receipt (the audit floor)");
  for (const s of selfReceipts) {
    assert.equal(s.cost.tokens.fresh, 0, "the self-tick floor burns no fresh tokens");
  }
});

test("THE COST METER: a flat field of skips + the root as the dominant fresh tick", () => {
  const stateDir = mkdtempSync(join(tmpdir(), "rdt-tree-cost-"));
  generateResearchTreeFixture({ stateDir });
  const session = openSession(stateDir);

  const skips = session.receipts.filter((r) => r.status === "skipped");
  assert.ok(skips.length > 0, "memo-skips exist (the quiet-world pulses)");
  for (const s of skips) {
    assert.equal(s.cost.tokens.fresh, 0, "skipped receipts carry zero fresh");
  }

  // The Root Synthesis holds the tallest single fresh tick (it re-weaves the
  // whole answer on every touched branch).
  const rootRenders = session.receipts.filter((r) => r.node === ROOT && r.status === "rendered");
  assert.ok(rootRenders.length >= 1, "the root rendered at least once");
  const maxFresh = Math.max(...session.receipts.map((r) => r.cost.tokens.fresh));
  const rootMax = Math.max(...rootRenders.map((r) => r.cost.tokens.fresh));
  assert.equal(rootMax, maxFresh, "the root holds the single tallest fresh tick");

  assert.ok(session.costRollup.total.fresh > 0, "fresh tokens were spent");
  assert.ok(session.costRollup.total.reused > 0, "reused tokens accumulate (memo hits)");
});

test("the research-tree fixture is deterministic — two generations are byte-identical", () => {
  const a = mkdtempSync(join(tmpdir(), "rdt-tree-det-a-"));
  const b = mkdtempSync(join(tmpdir(), "rdt-tree-det-b-"));
  generateResearchTreeFixture({ stateDir: a });
  generateResearchTreeFixture({ stateDir: b });

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
});
