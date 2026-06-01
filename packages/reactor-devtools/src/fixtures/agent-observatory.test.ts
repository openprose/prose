// Proof that the generated Agent State Observatory state-dir is a REAL,
// replayable corpus AND that it takes the four shots masked-relay cannot:
//   - the FACET DARK LANE: a single-Claude-session delta lights ≤1 adapter lane,
//   - the DIAMOND single-wake: workstream-index woken EXACTLY ONCE on a two-
//     summary delta,
//   - ≥1 `failed` receipt (the red Codex-fail shot),
//   - ≥1 `self` receipt (the audit-floor self-tick).
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
  FileSystemReceiptLedger,
  propagationTargets,
  ATOMIC_FACET,
  type TopologyWorldModel,
} from "@openprose/reactor/sdk";
import { createFileSystemStorageAdapter } from "@openprose/reactor";

import { generateAgentObservatoryFixture } from "./agent-observatory";

const GATEWAY = "gateway.runtime-watch";
const SESSION_LEDGER = "responsibility.session-ledger";
const WORKSTREAM_INDEX = "responsibility.workstream-index";
const CONCEPT_CLUSTERER = "responsibility.concept-clusterer";
const ADAPTER_PREFIX = "responsibility.adapter-";

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

test("generated observatory fixture loads via the SDK replay read surface", () => {
  const stateDir = mkdtempSync(join(tmpdir(), "rdt-obs-"));
  const result = generateAgentObservatoryFixture({ stateDir });

  // the three replayability ingredients + the labels map are on disk.
  assert.ok(existsSync(join(stateDir, "receipts.json")), "receipts trail present");
  assert.ok(existsSync(join(stateDir, "world-models")), "world-models dir present");
  assert.ok(
    existsSync(join(stateDir, "compile", "topology.json")),
    "topology snapshot present",
  );
  assert.ok(
    existsSync(join(stateDir, "compile", "labels.json")),
    "labels map present",
  );

  const session = openSession(stateDir);
  assert.equal(session.receipts.length, result.receiptsCount);
  assert.ok(session.receipts.length > 0, "trail is non-empty");

  // The §2 graph: gateway + 6 runtime adapters + session-ledger + 3 session
  // summaries + workstream-index + concept-clusterer + dashboard = 14 real nodes
  // (the phantom ingress source is NOT a topology node). The plan's "~13" is an
  // approximation; the enumerated §2 graph is 14.
  const topology = readTopology(stateDir);
  assert.equal(topology.nodes.length, 14, "the enumerated §2 graph (14 real nodes)");
  assert.equal(
    topology.nodes.filter((n) => n.node.startsWith(ADAPTER_PREFIX)).length,
    6,
    "six runtime adapters (the row mostly dark)",
  );
  assert.equal(
    topology.nodes.filter((n) => n.node.startsWith("responsibility.summary-")).length,
    3,
    "three per-session summaries",
  );
  assert.equal(topology.acyclic, true);
  assert.ok(topology.entry_points.includes(GATEWAY), "gateway is the entry point");

  // per-runtime facet edges exist on the gateway (the dark-lane boundary).
  for (const rt of ["claude", "codex", "opencode", "pi", "hermes", "openclaw"]) {
    assert.ok(
      topology.edges.some(
        (e) => e.producer === GATEWAY && e.facet === rt && e.subscriber === `${ADAPTER_PREFIX}${rt}`,
      ),
      `gateway exposes an independent "${rt}" facet edge to its adapter`,
    );
  }

  // per-session facet edges exist on the session ledger (the second dark lane).
  for (const sid of ["claudeA", "claudeB", "codexA"]) {
    assert.ok(
      topology.edges.some(
        (e) => e.producer === SESSION_LEDGER && e.facet === `session:${sid}`,
      ),
      `session ledger exposes a "session:${sid}" facet edge`,
    );
  }
});

test("THE DARK LANE: a single Claude-session delta lights ≤1 adapter lane", () => {
  const stateDir = mkdtempSync(join(tmpdir(), "rdt-obs-dark-"));
  generateAgentObservatoryFixture({ stateDir });
  const session = openSession(stateDir);
  const topology = readTopology(stateDir);

  // Find every gateway receipt that moved EXACTLY ONE runtime facet (the hero
  // beat moves only `claude`). For each, the edges it lights must touch ≤1
  // adapter subscriber — the five siblings stay dark.
  const runtimeFacets = new Set(["claude", "codex", "opencode", "pi", "hermes", "openclaw"]);
  let sawSingleRuntimeMove = false;

  for (let i = 0; i < session.receipts.length; i++) {
    const r = session.receipts[i]!;
    if (r.node !== GATEWAY || r.status !== "rendered") continue;
    const moved = session.movedFacetsByIndex[i]!;
    const movedRuntimes = [...moved].filter((f) => runtimeFacets.has(f));
    if (movedRuntimes.length !== 1) continue;
    sawSingleRuntimeMove = true;

    // The lit adapter lanes for this gateway frame, via the SDK's own dedupe.
    const targets = propagationTargets({
      topology,
      producer: GATEWAY,
      movedFacets: moved,
      wakeRef: r.content_hash,
    });
    const litAdapters = targets
      .map((t) => t.node)
      .filter((n) => n.startsWith(ADAPTER_PREFIX));
    assert.ok(
      litAdapters.length <= 1,
      `a single-runtime gateway delta lit ${litAdapters.length} adapter lanes (${litAdapters.join(
        ", ",
      )}); the dark lane requires ≤1`,
    );
    assert.equal(
      litAdapters[0],
      `${ADAPTER_PREFIX}${movedRuntimes[0]}`,
      "the lit adapter matches the moved runtime",
    );
  }

  assert.ok(
    sawSingleRuntimeMove,
    "the episode contains at least one single-runtime gateway delta (the hero beat)",
  );
});

test("THE DIAMOND: workstream-index is woken EXACTLY ONCE on a two-summary delta", () => {
  const stateDir = mkdtempSync(join(tmpdir(), "rdt-obs-diamond-"));
  generateAgentObservatoryFixture({ stateDir });
  const session = openSession(stateDir);
  const topology = readTopology(stateDir);

  // The diamond beat: two session summaries render in the same drain, both
  // feeding the workstream-index. The index must appear in the woken set EXACTLY
  // ONCE per producing summary frame (propagationTargets dedupes), and a single
  // session-ledger frame that moves two session facets must wake the two
  // summaries — never doubling the index.
  let sawTwoSessionMove = false;
  for (let i = 0; i < session.receipts.length; i++) {
    const r = session.receipts[i]!;
    if (r.node !== SESSION_LEDGER || r.status !== "rendered") continue;
    const moved = session.movedFacetsByIndex[i]!;
    const movedSessions = [...moved].filter((f) => f.startsWith("session:"));
    if (movedSessions.length < 2) continue;
    sawTwoSessionMove = true;

    const targets = propagationTargets({
      topology,
      producer: SESSION_LEDGER,
      movedFacets: moved,
      wakeRef: r.content_hash,
    });
    const summaries = targets.map((t) => t.node).filter((n) => n.startsWith("responsibility.summary-"));
    // No duplicate subscribers in the woken set (single-wake by construction).
    assert.equal(
      new Set(summaries).size,
      summaries.length,
      "no summary is woken twice from one ledger frame",
    );
    assert.ok(summaries.length >= 2, "a two-session ledger delta wakes ≥2 summaries");
  }
  assert.ok(sawTwoSessionMove, "the episode contains a two-session (diamond) delta");

  // And every workstream-index render appears at most once in the woken set of
  // any single producing summary frame.
  for (let i = 0; i < session.receipts.length; i++) {
    const r = session.receipts[i]!;
    if (!r.node.startsWith("responsibility.summary-") || r.status !== "rendered") continue;
    const moved = session.movedFacetsByIndex[i]!;
    if (moved.size === 0) continue;
    const targets = propagationTargets({
      topology,
      producer: r.node,
      movedFacets: moved,
      wakeRef: r.content_hash,
    });
    const indexHits = targets.map((t) => t.node).filter((n) => n === WORKSTREAM_INDEX);
    assert.ok(indexHits.length <= 1, "workstream-index appears ≤1× per summary frame");
  }
});

test("THE RED SHOT: at least one `failed` receipt (Codex adapter throw)", () => {
  const stateDir = mkdtempSync(join(tmpdir(), "rdt-obs-fail-"));
  generateAgentObservatoryFixture({ stateDir });
  const session = openSession(stateDir);

  const failed = session.receipts.filter((r) => r.status === "failed");
  assert.ok(failed.length >= 1, "at least one failed receipt (the red shot)");
  assert.ok(
    failed.some((r) => r.node === `${ADAPTER_PREFIX}codex`),
    "the Codex adapter is the node that failed",
  );
  // a failed receipt commits nothing downstream — fresh is zero (no work landed).
  for (const f of failed) {
    assert.equal(f.cost.tokens.fresh, 0, "failed receipts carry zero fresh");
  }
});

test("THE AUDIT FLOOR: at least one `self` receipt (the self-tick)", () => {
  const stateDir = mkdtempSync(join(tmpdir(), "rdt-obs-self-"));
  generateAgentObservatoryFixture({ stateDir });
  const session = openSession(stateDir);

  const selfReceipts = session.receipts.filter((r) => r.wake.source === "self");
  assert.ok(selfReceipts.length >= 1, "at least one self-sourced receipt (the audit floor)");
  // the self-tick on a quiet world lights nothing and costs ~nothing.
  for (const s of selfReceipts) {
    assert.equal(s.cost.tokens.fresh, 0, "the self-tick floor burns no fresh tokens");
  }
});

test("THE COST METER: a flat field of skips + one tall clusterer spike", () => {
  const stateDir = mkdtempSync(join(tmpdir(), "rdt-obs-cost-"));
  generateAgentObservatoryFixture({ stateDir });
  const session = openSession(stateDir);

  // skips exist (the quiet stretch) and carry zero fresh (the flat line).
  const skips = session.receipts.filter((r) => r.status === "skipped");
  assert.ok(skips.length > 0, "memo-skips exist (the quiet-world pulses)");
  for (const s of skips) {
    assert.equal(s.cost.tokens.fresh, 0, "skipped receipts carry zero fresh");
  }

  // the Concept Clusterer's fresh spend is the single tallest fresh spike.
  const clustererRenders = session.receipts.filter(
    (r) => r.node === CONCEPT_CLUSTERER && r.status === "rendered",
  );
  assert.ok(clustererRenders.length >= 1, "the clusterer rendered at least once");
  const maxFresh = Math.max(...session.receipts.map((r) => r.cost.tokens.fresh));
  const clustererMax = Math.max(...clustererRenders.map((r) => r.cost.tokens.fresh));
  assert.equal(
    clustererMax,
    maxFresh,
    "the clusterer holds the single tallest fresh spike (the expensive-batched beat)",
  );

  // the rollup is non-trivial: fresh > 0 overall and reused accumulates.
  assert.ok(session.costRollup.total.fresh > 0, "fresh tokens were spent");
  assert.ok(session.costRollup.total.reused > 0, "reused tokens accumulate (memo hits)");
});

test("the observatory fixture is deterministic — two generations are byte-identical", () => {
  const a = mkdtempSync(join(tmpdir(), "rdt-obs-det-a-"));
  const b = mkdtempSync(join(tmpdir(), "rdt-obs-det-b-"));
  generateAgentObservatoryFixture({ stateDir: a });
  generateAgentObservatoryFixture({ stateDir: b });

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
