// The Implementation Pipeline — tier-2 DETERMINISTIC gate (offline, zero spend).
//
// This file is the example's load-bearing proof. It drives the REAL
// `@openprose/reactor` reconciler (through the committed `generate.ts`) with
// deterministic fake renders — NO model key — and asserts the whole validity
// contract off the persisted ledger:
//
//   1. Compiles to the frozen artifact set: a valid TopologyWorldModel (16 nodes,
//      a SINGLE entry gateway, acyclic), labels.json, a flat receipts.json, and
//      world-models/<hexNodeId>/{published.json, versions/sha256_*.bin}.
//   2. Cold-start renders every node; an identical re-wake SKIPS all of them
//      (a skip propagates nothing and wakes nothing).
//   3. cost.surprise_cause === wake.source on EVERY committed receipt.
//   4. ATOMIC_FACET for facet-less producers; no "*" tokens anywhere.
//   5. Chain-verifies: verifyReceiptChain passes over the raw on-disk receipts.
//   6. Byte-deterministic: a second generation yields identical
//      receipts.json / topology.json / labels.json.
//
// Plus the example's own tenet — FACET-LEVEL LANE INVALIDATION UNDER A FIXED
// TOPOLOGY — encoded as the IP00..IP06 scenarios of the seed spec:
//   IP00 the graph is FIXED at 16 nodes; extra work is `unassigned_work`, never a
//        7th node.   IP02 a foundation change fans out to ALL SIX lanes once.
//   IP03 a lane-local change lights ONE lane; the five siblings stay dark.
//   IP04 a rejected lane never reaches integration.   IP06 a no-change replay
//        memo-skips the whole graph and the report fingerprint is stable.
//
// The README "what to assert" snippet mirrors this body (the EVALS.md pattern:
// if the snippet and this test drift, fix both together).

import { mkdtempSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  mountDag,
  createFileSystemReceiptLedger,
  createReplaySession,
  verifyReceiptChain,
  files,
  textFile,
  ATOMIC_FACET,
  type RenderContext,
} from "@openprose/reactor";
import {
  propagationTargets,
  type ReconcilerTopology,
  type TopologyWorldModel,
} from "@openprose/reactor/internals";
import {
  createFileSystemStorageAdapter,
} from "@openprose/reactor";

import { generateImplementationPipelineFixture } from "./generate";

// The 16 mounted nodes (the FIXED graph; the phantom ingress source is NOT one).
const GATEWAY = "gateway.planning-corpus";
const WORKPLAN = "responsibility.implementation-work-plan";
const FOUNDATION = "responsibility.foundation-builder";
const CONSTRUCTION_REVIEW = "responsibility.construction-review";
const INTEGRATION = "responsibility.integration-builder";
const REPORT = "responsibility.implementation-report";
const LANES = [
  "sdk-world-model",
  "sdk-runtime",
  "sdk-compile",
  "skill-contract",
  "examples-tests",
  "docs-signposts",
] as const;
const LANE_NODE = (l: string) => `responsibility.lane-${l}`;

function openSession(stateDir: string) {
  const storage = createFileSystemStorageAdapter({ directory: stateDir });
  const ledger = createFileSystemReceiptLedger({ storage });
  return createReplaySession({ ledger });
}
function readTopology(stateDir: string): TopologyWorldModel {
  return JSON.parse(
    readFileSync(join(stateDir, "compile", "topology.json"), "utf8"),
  ) as TopologyWorldModel;
}
// A node's published pointer: { version, fingerprints } (the content-address of
// its current truth + its facet fingerprint map).
function readPublished(
  stateDir: string,
  node: string,
): { version: string | null; fingerprints: Record<string, string> } {
  const hex = Buffer.from(node, "utf8").toString("hex");
  return JSON.parse(
    readFileSync(join(stateDir, "world-models", hex, "published.json"), "utf8"),
  ) as { version: string | null; fingerprints: Record<string, string> };
}
// Every committed world-model version body for a node (the durable truth bodies
// the audit surface replays — receipts.json carries fingerprints, not bodies).
function worldModelBodies(stateDir: string, node: string): string[] {
  const hex = Buffer.from(node, "utf8").toString("hex");
  const dir = join(stateDir, "world-models", hex, "versions");
  return readdirSync(dir).map((f) => readFileSync(join(dir, f), "utf8"));
}
function fresh(s: ReturnType<typeof openSession>): number {
  return s.costRollup.total.fresh;
}

// =====================================================================
// (1) The frozen artifact set: a valid TopologyWorldModel + the state-dir shape.
// =====================================================================
describe("implementation-pipeline — the frozen replay artifact set (validity #1)", () => {
  it("emits the full devtools state-dir shape (topology, labels, flat receipts, world-models)", () => {
    const dir = mkdtempSync(join(tmpdir(), "ip-art-"));
    const res = generateImplementationPipelineFixture({ stateDir: dir });

    expect(existsSync(join(dir, "compile", "topology.json"))).toBe(true);
    expect(existsSync(join(dir, "compile", "labels.json"))).toBe(true);
    expect(existsSync(join(dir, "beats.json"))).toBe(true);
    // receipts.json is a FLAT root file (not a receipts/ subdir).
    expect(existsSync(join(dir, "receipts.json"))).toBe(true);
    expect(existsSync(join(dir, "world-models"))).toBe(true);

    // world-models/<hexNodeId>/{published.json, versions/sha256_*.bin}. The node
    // dir is the HEX-encoded id (e.g. finding.B2 -> 66696e64696e672e4232).
    const hex = Buffer.from(GATEWAY, "utf8").toString("hex");
    expect(existsSync(join(dir, "world-models", hex, "published.json"))).toBe(true);
    const versions = readdirSync(join(dir, "world-models", hex, "versions"));
    expect(versions.some((f) => /^sha256_[0-9a-f]+\.bin$/.test(f))).toBe(true);

    // Every node has a label (normalized: present for every example).
    expect(res.nodeCount).toBe(16);
    const labels = JSON.parse(
      readFileSync(join(dir, "compile", "labels.json"), "utf8"),
    ) as Record<string, string>;
    for (const n of readTopology(dir).nodes) {
      expect(labels[n.node]).toBeTruthy();
    }
  });

  it("is a valid TopologyWorldModel: FIXED 16 nodes, SINGLE entry gateway, acyclic, resolved facet edges", () => {
    const dir = mkdtempSync(join(tmpdir(), "ip-topo-"));
    const res = generateImplementationPipelineFixture({ stateDir: dir });
    const topo = readTopology(dir);

    // IP00: the graph is FIXED. 1 gateway + corpus + work-plan + foundation +
    // foundation-review + 6 lanes + construction-review + integration +
    // verification + signpost + report = 16. NEVER a 7th lane.
    expect(topo.nodes.length).toBe(16);
    expect(res.nodeCount).toBe(16);
    expect(topo.nodes.filter((n) => n.node.startsWith("responsibility.lane-")).length).toBe(6);

    expect(topo.acyclic).toBe(true);
    expect(topo.entry_points).toEqual([GATEWAY]); // the SINGLE entry gateway

    // Each lane subscribes to its OWN work-plan lane facet (the dark-lane edges).
    for (const l of LANES) {
      expect(
        topo.edges.some(
          (e) => e.producer === WORKPLAN && e.facet === `lane:${l}` && e.subscriber === LANE_NODE(l),
        ),
      ).toBe(true);
    }
    // and to the foundation's shared-shapes facet (the fanout spine).
    for (const l of LANES) {
      expect(
        topo.edges.some(
          (e) => e.producer === FOUNDATION && e.facet === "shared-shapes" && e.subscriber === LANE_NODE(l),
        ),
      ).toBe(true);
    }
  });

  it("uses the ATOMIC_FACET constant for facet-less producers — and NO \"*\" token anywhere (validity #4)", () => {
    const dir = mkdtempSync(join(tmpdir(), "ip-facet-"));
    generateImplementationPipelineFixture({ stateDir: dir });
    const topo = readTopology(dir);

    // facet-less edges carry the real ATOMIC_FACET sentinel, never a "*".
    const atomicEdges = topo.edges.filter((e) => e.facet === ATOMIC_FACET);
    expect(atomicEdges.length).toBeGreaterThan(0);
    expect(topo.edges.every((e) => e.facet !== "*")).toBe(true);

    // belt-and-braces: no literal "*" token in the whole on-disk corpus.
    expect(readFileSync(join(dir, "compile", "topology.json"), "utf8")).not.toContain('"*"');
    expect(readFileSync(join(dir, "receipts.json"), "utf8")).not.toContain('facet":"*"');
  });
});

// =====================================================================
// (2)+(3) Dispositions, the surprise-cost invariant, and chain-verify.
// =====================================================================
describe("implementation-pipeline — dispositions, cost cause, chain-verify (validity #2/#3/#5)", () => {
  it("cold-start renders the whole fixed graph; the quiet beat memo-skips it (IP06)", () => {
    const dir = mkdtempSync(join(tmpdir(), "ip-disp-"));
    generateImplementationPipelineFixture({ stateDir: dir });
    const s = openSession(dir);

    // every mounted node renders at least once in the cold-boot cascade.
    const rendered = new Set(
      s.receipts.filter((r) => r.status === "rendered").map((r) => r.node),
    );
    for (const n of readTopology(dir).nodes) {
      expect(rendered.has(n.node)).toBe(true);
    }

    // the quiet beats contain memo-skips, and a skip carries ZERO fresh and
    // propagates nothing (the gateway skip below it wakes nobody).
    const skips = s.receipts.filter((r) => r.status === "skipped");
    expect(skips.length).toBeGreaterThan(0);
    for (const r of skips) expect(r.cost.tokens.fresh).toBe(0);
  });

  it("cost.surprise_cause === wake.source on EVERY committed receipt (validity #3)", () => {
    const dir = mkdtempSync(join(tmpdir(), "ip-cause-"));
    generateImplementationPipelineFixture({ stateDir: dir });
    const s = openSession(dir);
    for (const r of s.receipts) {
      expect(r.cost.surprise_cause).toBe(r.wake.source);
    }
  });

  it("chain-verifies: every per-node chain passes over the raw on-disk receipts (validity #5)", () => {
    const dir = mkdtempSync(join(tmpdir(), "ip-chain-"));
    generateImplementationPipelineFixture({ stateDir: dir });
    const s = openSession(dir);
    for (const node of s.chainByNode.keys()) {
      expect(s.verifyNodeChain(node).ok).toBe(true);
    }
    // verifyReceiptChain over a single node's chain directly resolves too.
    expect(verifyReceiptChain(s.chainByNode.get(GATEWAY) ?? []).ok).toBe(true);
  });
});

// =====================================================================
// THE TENET — facet-level lane invalidation under a FIXED topology (IP00..IP04).
// =====================================================================
describe("implementation-pipeline — facet-level lane invalidation (the tenet)", () => {
  it("IP00 · extra work the six lanes cannot cover is `unassigned_work`, NOT a 7th node", () => {
    const dir = mkdtempSync(join(tmpdir(), "ip-ip00-"));
    generateImplementationPipelineFixture({ stateDir: dir });
    const topo = readTopology(dir);

    // the graph stays at exactly 16 nodes (no 7th lane was ever mounted).
    expect(topo.nodes.length).toBe(16);
    expect(topo.nodes.filter((n) => n.node.startsWith("responsibility.lane-")).length).toBe(6);

    // the work-plan published a real truth (its @atomic version is content-addressed).
    const published = readPublished(dir, WORKPLAN);
    expect(published.fingerprints[ATOMIC_FACET]).toBeTruthy();

    // the work-plan recorded the un-ownable item in `unassigned_work` (a field on
    // its OWN maintained truth), never as a mounted node. Read its committed
    // world-model bodies (the audit surface), not a rerun.
    const wpTruth = worldModelBodies(dir, WORKPLAN);
    expect(wpTruth.some((b) => b.includes('"unassigned_work":["a telemetry dashboard nobody owns"]'))).toBe(true);

    // and the report surfaced it (the terminal projection cites unassigned_work).
    expect(worldModelBodies(dir, REPORT).some((b) => b.includes("telemetry dashboard"))).toBe(true);
  });

  it("IP03 · a lane-local change lights ONE lane; the five siblings stay dark", () => {
    const dir = mkdtempSync(join(tmpdir(), "ip-ip03-"));
    generateImplementationPipelineFixture({ stateDir: dir });
    const s = openSession(dir);
    const topo = readTopology(dir);

    // find a work-plan render that moved EXACTLY ONE lane facet (the lane-local
    // beat — distinct from the cold-boot cascade that moves all six at once).
    let sawLaneLocal = false;
    for (let i = 0; i < s.receipts.length; i++) {
      const r = s.receipts[i]!;
      if (r.node !== WORKPLAN || r.status !== "rendered") continue;
      const movedLanes = [...s.movedFacetsByIndex[i]!].filter((f) => f.startsWith("lane:"));
      if (movedLanes.length !== 1) continue;
      sawLaneLocal = true;

      const targets = propagationTargets({
        topology: topo,
        producer: WORKPLAN,
        movedFacets: s.movedFacetsByIndex[i]!,
        wakeRef: r.content_hash,
      });
      const litLanes = targets.map((t) => t.node).filter((n) => n.startsWith("responsibility.lane-"));
      expect(litLanes.length).toBe(1);
      expect(litLanes[0]).toBe(`responsibility.lane-${movedLanes[0]!.slice("lane:".length)}`);
    }
    expect(sawLaneLocal).toBe(true);
  });

  it("IP02 · a foundation change fans out to ALL SIX lanes once (intentional fanout)", () => {
    const dir = mkdtempSync(join(tmpdir(), "ip-ip02-"));
    generateImplementationPipelineFixture({ stateDir: dir });
    const s = openSession(dir);
    const topo = readTopology(dir);

    // find the foundation render that moved its `shared-shapes` facet WITHOUT a
    // sibling work-plan lane move in the same beat (the pure fanout: only the
    // shared shape changed).
    let sawFanout = false;
    for (let i = 0; i < s.receipts.length; i++) {
      const r = s.receipts[i]!;
      if (r.node !== FOUNDATION || r.status !== "rendered") continue;
      if (!s.movedFacetsByIndex[i]!.has("shared-shapes")) continue;

      const targets = propagationTargets({
        topology: topo,
        producer: FOUNDATION,
        movedFacets: s.movedFacetsByIndex[i]!,
        wakeRef: r.content_hash,
      });
      const litLanes = new Set(
        targets.map((t) => t.node).filter((n) => n.startsWith("responsibility.lane-")),
      );
      if (litLanes.size === 6) sawFanout = true;
    }
    expect(sawFanout).toBe(true);
  });

  it("IP04 · a rejected lane never reaches integration (review blocks the unsafe lane)", () => {
    const dir = mkdtempSync(join(tmpdir(), "ip-ip04-"));
    generateImplementationPipelineFixture({ stateDir: dir });

    // the construction-review committed a truth that REJECTED the unsafe lane
    // (its patch escaped its owned paths / hit a forbidden file).
    const reviewBodies = worldModelBodies(dir, CONSTRUCTION_REVIEW);
    const rejecting = reviewBodies.find((b) => b.includes('"rejected_lanes":[{'));
    expect(rejecting).toBeTruthy();
    expect(rejecting!).toContain("escapes owned paths");
    expect(rejecting!).toContain('"lane":"sdk-runtime"');

    // and the integration truth that recorded the exclusion NEVER lists the
    // forbidden file in its integrated_patch_set — the rejected lane is excluded
    // by construction (the forbidden `sign.ts` patch never integrates).
    const integBodies = worldModelBodies(dir, INTEGRATION);
    const excluding = integBodies.find((b) => b.includes('"excluded_lanes":["sdk-runtime"]'));
    expect(excluding).toBeTruthy();
    expect(excluding!).not.toContain("sign.ts");

    // NO integration truth ever integrates the forbidden file (across all versions).
    for (const b of integBodies) {
      const patchSet = b.slice(b.indexOf('"integrated_patch_set"'));
      expect(patchSet).not.toContain("receipt/sign.ts");
    }
  });
});

// =====================================================================
// The cost rollup — the EVALS-style claim: a quiet re-wake does NOT move
// total.fresh; a memo-key move (the lane-local / fanout / review beats) DOES.
// This is the README "what to assert" snippet, run verbatim.
// =====================================================================
describe("implementation-pipeline — cost rollup moves IFF the memo key moves (validity #2)", () => {
  it("a quiet re-wake spends 0 fresh; a memo-key edit spends +N — driven via the public SDK", () => {
    const dir = mkdtempSync(join(tmpdir(), "ip-rollup-"));
    const storage = createFileSystemStorageAdapter({ directory: dir });
    const ledger = createFileSystemReceiptLedger({ storage });

    // A deterministic fake render: cost.surprise_cause MUST equal ctx.wake.source.
    const render = (text: string) => (ctx: RenderContext) => ({
      world_model: files({ "out.txt": textFile(text) }),
      cost: {
        provider: "none",
        model: "fake",
        tokens: { fresh: 1, reused: 0 },
        surprise_cause: ctx.wake.source,
      },
    });

    // A facet-less producer subscribes on ATOMIC_FACET — NEVER a "*" wildcard.
    const topo: ReconcilerTopology = {
      topology: {
        nodes: [
          { node: GATEWAY, contract_fingerprint: "fp-gw", wake_source: "external" },
          { node: WORKPLAN, contract_fingerprint: "fp-wp", wake_source: "input" },
        ],
        edges: [{ subscriber: WORKPLAN, producer: GATEWAY, facet: ATOMIC_FACET }],
        entry_points: [GATEWAY],
        acyclic: true,
      },
      contract_fingerprints: { [GATEWAY]: "fp-gw", [WORKPLAN]: "fp-wp" },
    };
    const dag = mountDag({
      topology: topo,
      mounts: { [GATEWAY]: { render: render("v1") }, [WORKPLAN]: { render: render("plan v1") } },
      ledger,
    });

    const cold = dag.ingest(GATEWAY); // cold-start: both render
    expect(cold.map((r) => `${r.node}:${r.disposition}`).sort()).toEqual([
      `${GATEWAY}:rendered`,
      `${WORKPLAN}:rendered`,
    ]);
    expect(fresh(createReplaySession({ ledger }))).toBe(2);

    const quiet = dag.ingest(GATEWAY); // nothing moved -> gateway skips, plan untouched
    expect(quiet.map((r) => `${r.node}:${r.disposition}`)).toEqual([`${GATEWAY}:skipped`]);
    expect(fresh(createReplaySession({ ledger }))).toBe(2); // total.fresh did NOT move

    // A contract edit moves the memo key -> render + propagate.
    const topo2: ReconcilerTopology = {
      topology: {
        nodes: [
          { node: GATEWAY, contract_fingerprint: "fp-gw-v2", wake_source: "external" },
          { node: WORKPLAN, contract_fingerprint: "fp-wp", wake_source: "input" },
        ],
        edges: [{ subscriber: WORKPLAN, producer: GATEWAY, facet: ATOMIC_FACET }],
        entry_points: [GATEWAY],
        acyclic: true,
      },
      contract_fingerprints: { [GATEWAY]: "fp-gw-v2", [WORKPLAN]: "fp-wp" },
    };
    const dag2 = mountDag({
      topology: topo2,
      mounts: { [GATEWAY]: { render: render("v2") }, [WORKPLAN]: { render: render("plan v2") } },
      ledger,
    });
    const moved = dag2.ingest(GATEWAY);
    expect(moved.map((r) => `${r.node}:${r.disposition}`).sort()).toEqual([
      `${GATEWAY}:rendered`,
      `${WORKPLAN}:rendered`,
    ]);
    expect(fresh(createReplaySession({ ledger }))).toBe(4); // +2: fresh DID move
  });

  it("the committed fixture: byCause partitions total exactly, and a real fresh spike exists", () => {
    const dir = mkdtempSync(join(tmpdir(), "ip-bycause-"));
    generateImplementationPipelineFixture({ stateDir: dir });
    const s = openSession(dir);
    const { byCause, total } = s.costRollup;

    const sumFresh = Object.values(byCause).reduce((a, b) => a + b.fresh, 0);
    const sumReceipts = Object.values(byCause).reduce((a, b) => a + b.receipts, 0);
    expect(sumFresh).toBe(total.fresh);
    expect(sumReceipts).toBe(total.receipts);
    expect(total.fresh).toBeGreaterThan(0); // the meter sang (real renders)
  });
});

// =====================================================================
// (6) Byte-determinism: a second generation is identical.
// =====================================================================
describe("implementation-pipeline — byte-deterministic regeneration (validity #6)", () => {
  it("two generations produce identical receipts.json / topology.json / labels.json / beats.json", () => {
    const a = mkdtempSync(join(tmpdir(), "ip-det-a-"));
    const b = mkdtempSync(join(tmpdir(), "ip-det-b-"));
    generateImplementationPipelineFixture({ stateDir: a });
    generateImplementationPipelineFixture({ stateDir: b });

    for (const rel of [
      "receipts.json",
      join("compile", "topology.json"),
      join("compile", "labels.json"),
      "beats.json",
    ]) {
      expect(readFileSync(join(a, rel), "utf8")).toBe(readFileSync(join(b, rel), "utf8"));
    }
  });

  it("a regen does NOT clobber beats.json — the generator self-writes it (lossless regen)", () => {
    const dir = mkdtempSync(join(tmpdir(), "ip-beats-"));
    generateImplementationPipelineFixture({ stateDir: dir });
    const beats = JSON.parse(readFileSync(join(dir, "beats.json"), "utf8")) as {
      scenario: string;
      beats: { name: string; from: number; to: number }[];
    };
    expect(beats.scenario).toBe("implementation-pipeline");
    expect(beats.beats.map((x) => x.name)).toContain("foundation-fanout");
    expect(beats.beats.map((x) => x.name)).toContain("review-blocks");
    // the timeline is contiguous and ordered (no gaps left by a clobber).
    for (let i = 1; i < beats.beats.length; i++) {
      expect(beats.beats[i]!.from).toBe(beats.beats[i - 1]!.to + 1);
    }
  });
});
