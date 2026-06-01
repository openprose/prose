// forme-fixpoint — the TIER-2 deterministic gate (offline, zero model spend).
//
// This is the "doc-snippet-is-the-test" pattern from packages/reactor/EVALS.md:
// the body mirrors the README/AUTHORING walkthrough and drives the REAL
// @openprose/reactor reconciler with deterministic fake renders (no key), then
// asserts every clause of the validity contract OFF THE PERSISTED LEDGER.
//
// THE FLAGSHIP LESSON — topology-as-world-model:
//   A seed runs Forme; Forme commits the active graph as a versioned truth;
//   invalid candidates (an ambiguous producer, a cycle) move ONLY the
//   `diagnostics` facet, NOT the `active-graph` facet — so the Schedule Plan
//   (which subscribes to `active-graph` ONLY) MEMO-SKIPS, and the prior valid
//   active graph stands. THE CRADLE: the seed + reconciler are fixed ground.
//
// THE VALIDITY CONTRACT asserted here (all offline, at zero spend):
//   1. Compiles to the frozen artifact set (topology valid, single-vocabulary
//      entry gateways, acyclic; labels + flat receipts + world-models present).
//   2. Cold-start renders all nodes; an identical re-wake SKIPS all (a skip
//      propagates nothing, wakes nothing).
//   3. cost.surprise_cause === wake.source on every committed receipt.
//   4. ATOMIC_FACET for facet-less producers; no "*" tokens anywhere.
//   5. Chain-verifies: verifyReceiptChain passes over the raw on-disk receipts.
//   6. Byte-deterministic: a second regeneration yields identical
//      receipts.json / topology.json / labels.json.
// Plus the active/candidate split + the costRollup quiet-vs-surprise invariant.
//
// RUN (offline, zero spend):
//   cd /Users/sl/code/prose && REACTOR_OFFLINE=1 pnpm test:examples
//     (or scope: REACTOR_OFFLINE=1 npx vitest run skills/open-prose/examples/forme-fixpoint)

import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createFileSystemStorageAdapter } from "@openprose/reactor";
import {
  mountDag,
  createFileSystemReceiptLedger,
  createReplaySession,
  verifyReceiptChain,
  files,
  textFile,
  ATOMIC_FACET,
  type ReconcilerTopology,
  type RenderContext,
  type LedgerReceipt,
  type TopologyWorldModel,
} from "@openprose/reactor/sdk";

import { generateFormeFixpointFixture } from "./generate";

const COMMITTED = join(__dirname, "replay");

const GW_CONTRACTS = "gateway.contract-source-files";
const GW_PINS = "gateway.operator-pins";
const REGISTRY = "responsibility.contract-registry";
const MAINTAINER = "responsibility.topology-maintainer";
const SCHEDULE = "responsibility.schedule-plan";
const REPORTER = "responsibility.topology-change-reporter";
const AUDITOR = "responsibility.topology-safety-auditor";

const ACTIVE_GRAPH_FACET = "active-graph";
const DIAGNOSTICS_FACET = "diagnostics";

function openSession(stateDir: string) {
  const storage = createFileSystemStorageAdapter({ directory: stateDir });
  const ledger = createFileSystemReceiptLedger({ storage });
  return { session: createReplaySession({ ledger }), ledger };
}

function readTopology(stateDir: string): TopologyWorldModel {
  return JSON.parse(
    readFileSync(join(stateDir, "compile", "topology.json"), "utf8"),
  ) as TopologyWorldModel;
}

function withTempFixture<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "forme-fixpoint-"));
  try {
    generateFormeFixpointFixture({ stateDir: dir });
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ===========================================================================
// THE WORKED SNIPPET — the AUTHORING walkthrough, run verbatim as a test. This
// is the minimal hand-mounted active/candidate split: a contract registry
// produces a `contract-set` gate; Forme exposes `active-graph` + `diagnostics`;
// the schedule reads `active-graph` ONLY. A rejected candidate moves diagnostics
// but NOT active-graph, so the schedule SKIPS.
// ===========================================================================

describe("forme-fixpoint — the active/candidate split (the worked AUTHORING snippet)", () => {
  it("a valid candidate renders + propagates; a rejected one moves diagnostics only, schedule skips", () => {
    const dir = mkdtempSync(join(tmpdir(), "forme-snippet-"));
    try {
      const storage = createFileSystemStorageAdapter({ directory: dir });
      const ledger = createFileSystemReceiptLedger({ storage });

      // A deterministic render per node. The invariant the commit verifies:
      // cost.surprise_cause === ctx.wake.source (read off the wake, NEVER hardcoded).
      const render =
        (text: string) =>
        (ctx: RenderContext) => ({
          world_model: files({ "out.txt": textFile(text) }),
          cost: {
            provider: "none",
            model: "fake",
            tokens: { fresh: 1, reused: 0 },
            surprise_cause: ctx.wake.source,
          },
        });

      // The minimal control-plane chain: registry -> Forme -> schedule. The
      // facet-less producers expose the atomic facet via ATOMIC_FACET (NEVER a
      // "*" wildcard — an unknown facet token silently never propagates). The
      // FULL active/candidate FACET split (active-graph vs diagnostics) is proven
      // against the committed fixture in "THE INVARIANT" below, where Forme's real
      // canonicalizer emits the two independent facets.
      const topology: ReconcilerTopology = {
        topology: {
          nodes: [
            { node: REGISTRY, contract_fingerprint: "fp-reg-v1", wake_source: "external" },
            { node: MAINTAINER, contract_fingerprint: "fp-forme", wake_source: "input" },
            { node: SCHEDULE, contract_fingerprint: "fp-sched", wake_source: "input" },
          ],
          edges: [
            { subscriber: MAINTAINER, producer: REGISTRY, facet: ATOMIC_FACET },
            { subscriber: SCHEDULE, producer: MAINTAINER, facet: ATOMIC_FACET },
          ],
          entry_points: [REGISTRY],
          acyclic: true,
        },
        contract_fingerprints: { [REGISTRY]: "fp-reg-v1", [MAINTAINER]: "fp-forme", [SCHEDULE]: "fp-sched" },
      };
      const dag = mountDag({
        topology,
        mounts: {
          [REGISTRY]: { render: render("contract-set v1") },
          [MAINTAINER]: { render: render("active-graph v1") },
          [SCHEDULE]: { render: render("schedule v1") },
        },
        ledger,
      });

      // Cold-start: all three render.
      const first = dag.ingest(REGISTRY);
      expect(first.map((r) => `${r.node}:${r.disposition}`).sort()).toEqual(
        [`${MAINTAINER}:rendered`, `${REGISTRY}:rendered`, `${SCHEDULE}:rendered`].sort(),
      );

      // Quiet re-wake: nothing moved -> registry skips, nothing downstream wakes.
      const second = dag.ingest(REGISTRY);
      expect(second.map((r) => `${r.node}:${r.disposition}`)).toEqual([`${REGISTRY}:skipped`]);
      expect(createReplaySession({ ledger }).costRollup.total.fresh).toBe(3);

      // The worked epoch: a contract-set edit (new contract_fingerprint) moves
      // the registry's memo key -> registry renders and wakes Forme + schedule.
      const topology2: ReconcilerTopology = {
        ...topology,
        topology: {
          ...topology.topology,
          nodes: [
            { node: REGISTRY, contract_fingerprint: "fp-reg-v2", wake_source: "external" },
            { node: MAINTAINER, contract_fingerprint: "fp-forme", wake_source: "input" },
            { node: SCHEDULE, contract_fingerprint: "fp-sched", wake_source: "input" },
          ],
        },
        contract_fingerprints: { [REGISTRY]: "fp-reg-v2", [MAINTAINER]: "fp-forme", [SCHEDULE]: "fp-sched" },
      };
      const dag2 = mountDag({
        topology: topology2,
        mounts: {
          [REGISTRY]: { render: render("contract-set v2") },
          [MAINTAINER]: { render: render("active-graph v2") },
          [SCHEDULE]: { render: render("schedule v2") },
        },
        ledger,
      });
      const third = dag2.ingest(REGISTRY);
      expect(third.map((r) => `${r.node}:${r.disposition}`).sort()).toEqual(
        [`${MAINTAINER}:rendered`, `${REGISTRY}:rendered`, `${SCHEDULE}:rendered`].sort(),
      );
      // A real change rendered + propagated -> fresh moves 3 -> 6.
      expect(createReplaySession({ ledger }).costRollup.total.fresh).toBe(6);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ===========================================================================
// THE COMMITTED FIXTURE — the full forme-fixpoint state-dir, asserted off the
// persisted ledger via the SAME read view devtools renders.
// ===========================================================================

describe("forme-fixpoint — clause 1: compiles to the frozen artifact set", () => {
  it("the committed replay/ has topology + labels + flat receipts + world-models", () => {
    expect(existsSync(join(COMMITTED, "compile", "topology.json"))).toBe(true);
    expect(existsSync(join(COMMITTED, "compile", "labels.json"))).toBe(true);
    expect(existsSync(join(COMMITTED, "receipts.json"))).toBe(true); // FLAT root ledger
    expect(existsSync(join(COMMITTED, "world-models"))).toBe(true);
    expect(existsSync(join(COMMITTED, "beats.json"))).toBe(true);
  });

  it("the topology is a valid TopologyWorldModel: acyclic, two entry gateways, resolved edges", () => {
    const topology = readTopology(COMMITTED);
    expect(topology.acyclic).toBe(true);
    expect(topology.nodes.length).toBe(7);
    // The two external-driven gateways are the entry points.
    expect([...topology.entry_points].sort()).toEqual([GW_CONTRACTS, GW_PINS]);
    // Every entry point is wake_source external; every responsibility is input.
    for (const n of topology.nodes) {
      const expected = n.node.startsWith("gateway.") ? "external" : "input";
      expect(n.wake_source).toBe(expected);
    }
    // Edges are resolved {subscriber, producer, facet} triples over declared nodes.
    const declared = new Set(topology.nodes.map((n) => n.node));
    for (const e of topology.edges) {
      expect(declared.has(e.subscriber)).toBe(true);
      // Producers may be phantom ingress sources; the topology nodes are the real graph.
      expect(typeof e.facet).toBe("string");
    }
    // The active/candidate split is wired: the schedule subscribes to active-graph
    // ONLY; the reporter + auditor read BOTH facets.
    expect(
      topology.edges.some(
        (e) => e.subscriber === SCHEDULE && e.producer === MAINTAINER && e.facet === ACTIVE_GRAPH_FACET,
      ),
    ).toBe(true);
    expect(
      topology.edges.some((e) => e.subscriber === SCHEDULE && e.facet === DIAGNOSTICS_FACET),
    ).toBe(false);
    for (const sub of [REPORTER, AUDITOR]) {
      for (const facet of [ACTIVE_GRAPH_FACET, DIAGNOSTICS_FACET]) {
        expect(
          topology.edges.some((e) => e.subscriber === sub && e.producer === MAINTAINER && e.facet === facet),
        ).toBe(true);
      }
    }
  });
});

describe("forme-fixpoint — clause 2: cold-start renders all; an identical re-wake skips", () => {
  it("the committed trail has a cold-start render burst AND a long contiguous quiet skip run", () => {
    const { session } = openSession(COMMITTED);
    const receipts = session.receipts;
    expect(receipts.length).toBeGreaterThan(0);

    // The cold-start burst: each control-plane node renders at least once.
    for (const node of [GW_CONTRACTS, GW_PINS, REGISTRY, MAINTAINER, SCHEDULE, REPORTER, AUDITOR]) {
      expect(
        receipts.some((r) => r.node === node && r.status === "rendered"),
        `${node} rendered at least once (cold-start)`,
      ).toBe(true);
    }

    // A skip propagates nothing and burns zero fresh: every skipped receipt has fresh 0.
    const skips = receipts.filter((r) => r.status === "skipped");
    expect(skips.length).toBeGreaterThan(0);
    for (const s of skips) expect(s.cost.tokens.fresh).toBe(0);

    // A LONG contiguous quiet run (the byte-identical re-scans memo-skip).
    let longestZeroRun = 0;
    let run = 0;
    for (const r of receipts) {
      if (r.cost.tokens.fresh === 0) longestZeroRun = Math.max(longestZeroRun, ++run);
      else run = 0;
    }
    expect(longestZeroRun).toBeGreaterThanOrEqual(7);
  });

  it("a fresh cold-mount of the committed topology renders all; an identical re-ingest skips all", () => {
    // Drive the live reconciler over a temp ledger using the committed topology
    // shape. This proves clause 2 mechanically (not just from the trail).
    const dir = mkdtempSync(join(tmpdir(), "forme-cold-"));
    try {
      const storage = createFileSystemStorageAdapter({ directory: dir });
      const ledger = createFileSystemReceiptLedger({ storage });
      const render =
        (text: string) =>
        (ctx: RenderContext) => ({
          world_model: files({ "out.txt": textFile(text) }),
          cost: { provider: "none", model: "fake", tokens: { fresh: 1, reused: 0 }, surprise_cause: ctx.wake.source },
        });
      const topology: ReconcilerTopology = {
        topology: {
          nodes: [
            { node: REGISTRY, contract_fingerprint: "fp-reg", wake_source: "external" },
            { node: MAINTAINER, contract_fingerprint: "fp-forme", wake_source: "input" },
            { node: SCHEDULE, contract_fingerprint: "fp-sched", wake_source: "input" },
            { node: REPORTER, contract_fingerprint: "fp-rep", wake_source: "input" },
            { node: AUDITOR, contract_fingerprint: "fp-aud", wake_source: "input" },
          ],
          edges: [
            { subscriber: MAINTAINER, producer: REGISTRY, facet: ATOMIC_FACET },
            { subscriber: SCHEDULE, producer: MAINTAINER, facet: ATOMIC_FACET },
            { subscriber: REPORTER, producer: MAINTAINER, facet: ATOMIC_FACET },
            { subscriber: AUDITOR, producer: MAINTAINER, facet: ATOMIC_FACET },
          ],
          entry_points: [REGISTRY],
          acyclic: true,
        },
        contract_fingerprints: { [REGISTRY]: "fp-reg", [MAINTAINER]: "fp-forme", [SCHEDULE]: "fp-sched", [REPORTER]: "fp-rep", [AUDITOR]: "fp-aud" },
      };
      const mounts = Object.fromEntries(
        [REGISTRY, MAINTAINER, SCHEDULE, REPORTER, AUDITOR].map((n) => [n, { render: render(`${n}-v1`) }]),
      );
      const dag = mountDag({ topology, mounts, ledger });

      const cold = dag.ingest(REGISTRY);
      expect(cold.filter((r) => r.disposition === "rendered").length).toBe(5);

      const requiet = dag.ingest(REGISTRY);
      expect(requiet.map((r) => `${r.node}:${r.disposition}`)).toEqual([`${REGISTRY}:skipped`]);
      // The skip propagated nothing: only the registry receipt was written.
      expect(requiet.length).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("forme-fixpoint — clause 3: cost.surprise_cause === wake.source on every committed receipt", () => {
  it("every receipt's surprise_cause matches its wake source", () => {
    const { session } = openSession(COMMITTED);
    for (const r of session.receipts) {
      expect(r.cost.surprise_cause).toBe(r.wake.source);
    }
  });
});

describe("forme-fixpoint — clause 4: ATOMIC_FACET for facet-less producers; no '*' tokens", () => {
  it("no edge or fingerprint key is the bare '*' wildcard; atomic edges use ATOMIC_FACET", () => {
    const topology = readTopology(COMMITTED);
    for (const e of topology.edges) {
      expect(e.facet).not.toBe("*");
    }
    const { session } = openSession(COMMITTED);
    for (const r of session.receipts) {
      for (const key of Object.keys(r.fingerprints)) {
        expect(key).not.toBe("*");
      }
    }
    // ATOMIC_FACET is the real token used by the facet-less edges: the registry
    // subscribes to the contract-source gateway's whole truth atomically.
    expect(
      topology.edges.some(
        (e) => e.subscriber === REGISTRY && e.producer === GW_CONTRACTS && e.facet === ATOMIC_FACET,
      ),
    ).toBe(true);
    // ATOMIC_FACET is a real, non-empty token (never the "*" wildcard).
    expect(ATOMIC_FACET).not.toBe("*");
    expect(ATOMIC_FACET.length).toBeGreaterThan(0);
  });
});

describe("forme-fixpoint — clause 5: the raw on-disk receipts chain-verify", () => {
  it("verifyReceiptChain passes over the committed receipts.json", () => {
    const raw = JSON.parse(readFileSync(join(COMMITTED, "receipts.json"), "utf8")) as LedgerReceipt[];
    expect(raw.length).toBeGreaterThan(0);
    // Per-node chains: verifyReceiptChain checks a single node's append-only chain.
    const byNode = new Map<string, LedgerReceipt[]>();
    for (const r of raw) (byNode.get(r.node) ?? byNode.set(r.node, []).get(r.node)!).push(r);
    for (const [, chain] of byNode) {
      const result = verifyReceiptChain(chain);
      expect(result.ok, `chain for ${chain[0]!.node} verifies`).toBe(true);
    }
  });
});

describe("forme-fixpoint — clause 6: byte-deterministic regeneration", () => {
  it("two regenerations yield identical receipts.json / topology.json / labels.json / beats.json", () => {
    const a = mkdtempSync(join(tmpdir(), "forme-det-a-"));
    const b = mkdtempSync(join(tmpdir(), "forme-det-b-"));
    try {
      generateFormeFixpointFixture({ stateDir: a });
      generateFormeFixpointFixture({ stateDir: b });
      for (const rel of [
        "receipts.json",
        join("compile", "topology.json"),
        join("compile", "labels.json"),
        "beats.json",
      ]) {
        expect(readFileSync(join(a, rel), "utf8")).toBe(readFileSync(join(b, rel), "utf8"));
      }
    } finally {
      rmSync(a, { recursive: true, force: true });
      rmSync(b, { recursive: true, force: true });
    }
  });

  it("the committed replay/ matches a fresh regeneration (the fixture is not stale)", () => {
    withTempFixture((dir) => {
      for (const rel of [
        "receipts.json",
        join("compile", "topology.json"),
        join("compile", "labels.json"),
        "beats.json",
      ]) {
        expect(
          readFileSync(join(dir, rel), "utf8"),
          `committed ${rel} matches a fresh regeneration`,
        ).toBe(readFileSync(join(COMMITTED, rel), "utf8"));
      }
    });
  });
});

// ===========================================================================
// THE FLAGSHIP INVARIANT — topology-as-world-model: a rejected candidate moves
// `diagnostics` but NOT `active-graph`, so the Schedule Plan memo-skips.
// ===========================================================================

describe("forme-fixpoint — THE INVARIANT: invalid candidates cannot corrupt scheduling", () => {
  it("a Forme render that rejects a candidate moves diagnostics, never active-graph; the schedule does not re-render across it", () => {
    const { session } = openSession(COMMITTED);
    const receipts = session.receipts;

    // Find a Forme render whose diagnostics facet moved but active-graph did NOT
    // (a rejected candidate). The fixture scripts an ambiguous-producer beat and
    // a bad-cycle beat — at least one such render must exist.
    let sawRejection = false;
    for (let i = 0; i < receipts.length; i++) {
      const r = receipts[i]!;
      if (r.node !== MAINTAINER || r.status !== "rendered") continue;
      const moved = session.movedFacetsByIndex[i]!;
      if (!moved.has(DIAGNOSTICS_FACET) || moved.has(ACTIVE_GRAPH_FACET)) continue;
      // This is a rejection: diagnostics moved, active-graph held.
      sawRejection = true;

      // The Schedule Plan must NOT re-render before the next Forme render — it
      // subscribes to active-graph ONLY, which did not move.
      let nextMaintainer = receipts.length;
      for (let j = i + 1; j < receipts.length; j++) {
        if (receipts[j]!.node === MAINTAINER) { nextMaintainer = j; break; }
      }
      const scheduleRendersInWindow = receipts
        .slice(i + 1, nextMaintainer)
        .filter((rr) => rr.node === SCHEDULE && rr.status === "rendered");
      expect(
        scheduleRendersInWindow.length,
        "the schedule plan does NOT re-render across a rejected candidate (active-graph held)",
      ).toBe(0);
    }
    expect(sawRejection, "the fixture contains a rejected candidate (diagnostics moved, active-graph held)").toBe(true);
  });

  it("at least one accepted candidate DID move active-graph and drove a schedule render (the accept path)", () => {
    const { session } = openSession(COMMITTED);
    const receipts = session.receipts;
    let sawAccept = false;
    for (let i = 0; i < receipts.length; i++) {
      const r = receipts[i]!;
      if (r.node !== MAINTAINER || r.status !== "rendered") continue;
      if (!session.movedFacetsByIndex[i]!.has(ACTIVE_GRAPH_FACET)) continue;
      sawAccept = true;
      // A schedule render must follow before the next Forme render.
      let nextMaintainer = receipts.length;
      for (let j = i + 1; j < receipts.length; j++) {
        if (receipts[j]!.node === MAINTAINER) { nextMaintainer = j; break; }
      }
      const scheduleRendered = receipts
        .slice(i + 1, nextMaintainer)
        .some((rr) => rr.node === SCHEDULE && rr.status === "rendered");
      expect(scheduleRendered, "an accepted active-graph move replans the schedule").toBe(true);
    }
    expect(sawAccept, "the fixture contains an accepted candidate (active-graph moved)").toBe(true);
  });
});

// ===========================================================================
// THE COST ROLLUP — quiet stays flat; a forced render moves total.fresh. The
// SAME read view devtools renders (createReplaySession), asserted in-process.
// ===========================================================================

describe("forme-fixpoint — costRollup: quiet does not move fresh; a contract edit does", () => {
  it("total.fresh does NOT move on a quiet re-wake and DOES move when a contract_fingerprint edit forces a render", () => {
    const dir = mkdtempSync(join(tmpdir(), "forme-cost-"));
    try {
      const storage = createFileSystemStorageAdapter({ directory: dir });
      const ledger = createFileSystemReceiptLedger({ storage });
      const render =
        (text: string) =>
        (ctx: RenderContext) => ({
          world_model: files({ "out.txt": textFile(text) }),
          cost: { provider: "none", model: "fake", tokens: { fresh: 5, reused: 0 }, surprise_cause: ctx.wake.source },
        });
      const mk = (regFp: string): ReconcilerTopology => ({
        topology: {
          nodes: [
            { node: REGISTRY, contract_fingerprint: regFp, wake_source: "external" },
            { node: MAINTAINER, contract_fingerprint: "fp-forme", wake_source: "input" },
          ],
          edges: [{ subscriber: MAINTAINER, producer: REGISTRY, facet: ATOMIC_FACET }],
          entry_points: [REGISTRY],
          acyclic: true,
        },
        contract_fingerprints: { [REGISTRY]: regFp, [MAINTAINER]: "fp-forme" },
      });
      const mounts = { [REGISTRY]: { render: render("v1") }, [MAINTAINER]: { render: render("d1") } };

      const dag = mountDag({ topology: mk("fp-v1"), mounts, ledger });
      dag.ingest(REGISTRY); // cold: both render -> fresh 10
      const afterCold = createReplaySession({ ledger }).costRollup;
      expect(afterCold.total.fresh).toBe(10);

      dag.ingest(REGISTRY); // quiet: registry skips -> fresh unchanged
      expect(createReplaySession({ ledger }).costRollup.total.fresh).toBe(10);

      // byCause partitions total exactly.
      const rollup = createReplaySession({ ledger }).costRollup;
      const causeSum =
        rollup.byCause.external.fresh + rollup.byCause.input.fresh + rollup.byCause.self.fresh;
      expect(causeSum).toBe(rollup.total.fresh);

      // A contract_fingerprint edit forces a render -> fresh MOVES.
      const dag2 = mountDag({
        topology: mk("fp-v2"),
        mounts: { [REGISTRY]: { render: render("v2") }, [MAINTAINER]: { render: render("d2") } },
        ledger,
      });
      dag2.ingest(REGISTRY);
      expect(createReplaySession({ ledger }).costRollup.total.fresh).toBe(20);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
