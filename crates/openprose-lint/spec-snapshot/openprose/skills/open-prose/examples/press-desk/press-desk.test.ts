// press-desk — the deterministic tier-2 gate (offline, ZERO model spend).
//
// This file IS the worked example the README/AUTHORING points at: it drives the
// REAL `@openprose/reactor` reconciler through the public exports, asserts the
// validity contract off the persisted ledger, and proves THIS example's two
// tenets — a deterministic HUMAN GATE (gateCommit: the briefing maintains truth
// but refuses the outward action) and a PRIVACY PROJECTION (the `public` facet
// carries no sender PII by construction). If this test breaks, the example is
// invalid.
//
// It asserts, all offline:
//   1. Compiles to the frozen artifact set (topology valid, single entry, acyclic).
//   2. Cold-start renders all; an identical re-wake skips all (skip propagates
//      nothing, wakes nothing).
//   3. cost.surprise_cause === wake.source on every committed receipt.
//   4. ATOMIC_FACET for facet-less producers; no "*" tokens anywhere.
//   5. verifyReceiptChain passes over the raw on-disk receipts.
//   6. Byte-deterministic regeneration (receipts/topology/labels identical).
//   + THE GATE TENET: the high-importance inquiry drives the briefing to
//     status "needs_human" with auto_reply === false.
//   + THE PROJECTION TENET: the `public` projection contains NONE of the raw
//     sender PII that appears in the owner-only view.

import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
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
  type RenderContext,
  type LedgerReceipt,
} from "@openprose/reactor";
import {
  FileSystemWorldModelStore,
  readTextFile,
  type WorldModelStore,
} from "@openprose/reactor/adapters";
import {
  propagationTargets,
  type ReconcilerTopology,
  type TopologyWorldModel,
} from "@openprose/reactor/internals";

import { generatePressDeskExample } from "./generate";

const SOURCE = "ingress.press-feed"; // the phantom external feed (not a node)
const GATEWAY = "gateway.press-inbox";
const REGISTER = "responsibility.opportunity-register";
const BRIEFING = "responsibility.briefing";
const FILTER_PREFIX = "responsibility.relevance-filter-";
const BLAST_FILTER = "responsibility.relevance-filter-blast1";
const HIGH_FILTER = "responsibility.relevance-filter-partner2";

const COMMITTED = join(__dirname, "replay");

function withTempDir<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "press-desk-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function readTopology(stateDir: string): TopologyWorldModel {
  return JSON.parse(
    readFileSync(join(stateDir, "compile", "topology.json"), "utf8"),
  ) as TopologyWorldModel;
}

function openSession(stateDir: string) {
  const storage = createFileSystemStorageAdapter({ directory: stateDir });
  const ledger = createFileSystemReceiptLedger({ storage });
  return createReplaySession({ ledger });
}

function rawReceipts(stateDir: string): LedgerReceipt[] {
  return JSON.parse(
    readFileSync(join(stateDir, "receipts.json"), "utf8"),
  ) as LedgerReceipt[];
}

// Read a node's PUBLISHED truth body off the on-disk FileSystem world-model store.
function readPublishedTruth(
  stateDir: string,
  node: string,
): Record<string, unknown> | null {
  const store: WorldModelStore = new FileSystemWorldModelStore({
    directory: join(stateDir, "world-models"),
  });
  const read = store.read(node, "published");
  if (read.ref.version === null) return null;
  const bytes = read.files["truth.json"];
  if (bytes === undefined) return null;
  return JSON.parse(readTextFile(bytes)) as Record<string, unknown>;
}

// ===========================================================================
// (1) Compiles to the frozen artifact set — topology valid, single entry,
//     acyclic — and the committed replay/ matches a fresh generation.
// ===========================================================================

describe("press-desk — (1) frozen artifact set", () => {
  it("the committed topology is a valid TopologyWorldModel: single entry gateway, acyclic", () => {
    const topology = readTopology(COMMITTED);
    expect(topology.acyclic).toBe(true);
    expect(topology.entry_points).toEqual([GATEWAY]);
    // 8 real nodes: gateway + 5 relevance filters + register + briefing.
    // (The phantom ingress source is NOT a topology node.)
    expect(topology.nodes.length).toBe(8);
    const ids = new Set(topology.nodes.map((n) => n.node));
    // every subscriber is a declared node; every producer is a declared node OR
    // the single phantom ingress feed the gateway watches (the external edge).
    for (const e of topology.edges) {
      expect(ids.has(e.subscriber)).toBe(true);
      expect(ids.has(e.producer) || e.producer === SOURCE).toBe(true);
    }
    // exactly one external entry point.
    const externals = topology.nodes.filter((n) => n.wake_source === "external");
    expect(externals.map((n) => n.node)).toEqual([GATEWAY]);
  });

  it("ships every mandatory replay artifact", () => {
    expect(() => readTopology(COMMITTED)).not.toThrow();
    expect(() =>
      readFileSync(join(COMMITTED, "compile", "labels.json")),
    ).not.toThrow();
    expect(() => readFileSync(join(COMMITTED, "beats.json"))).not.toThrow();
    expect(() => readFileSync(join(COMMITTED, "receipts.json"))).not.toThrow();
    const hexBriefing = Buffer.from(BRIEFING, "utf8").toString("hex");
    expect(() =>
      readFileSync(join(COMMITTED, "world-models", hexBriefing, "published.json")),
    ).not.toThrow();
  });
});

// ===========================================================================
// (4) ATOMIC_FACET for facet-less producers; NO "*" tokens anywhere.
// ===========================================================================

describe('press-desk — (4) ATOMIC_FACET, never "*"', () => {
  it("the gateway's external edge subscribes to the exported ATOMIC_FACET constant", () => {
    const topology = readTopology(COMMITTED);
    const ext = topology.edges.filter(
      (e) => e.subscriber === GATEWAY && e.producer === SOURCE,
    );
    expect(ext.length).toBe(1);
    for (const e of ext) expect(e.facet).toBe(ATOMIC_FACET);
  });

  it("the register fan-in subscribes to each filter's named `qualified` facet (never \"*\")", () => {
    const topology = readTopology(COMMITTED);
    const fanIn = topology.edges.filter(
      (e) => e.subscriber === REGISTER && e.producer.startsWith(FILTER_PREFIX),
    );
    expect(fanIn.length).toBe(5);
    for (const e of fanIn) expect(e.facet).toBe("qualified");
  });

  it('no "*" wildcard token appears in any committed artifact', () => {
    for (const rel of [
      "compile/topology.json",
      "compile/labels.json",
      "receipts.json",
    ]) {
      const txt = readFileSync(join(COMMITTED, rel), "utf8");
      expect(txt.includes('"*"')).toBe(false);
    }
  });
});

// ===========================================================================
// (3) cost.surprise_cause === wake.source on every committed receipt.
// ===========================================================================

describe("press-desk — (3) surprise_cause === wake.source", () => {
  it("holds on every committed receipt (read off the wake, never hardcoded)", () => {
    for (const r of rawReceipts(COMMITTED)) {
      expect(r.cost.surprise_cause).toBe(r.wake.source);
    }
  });
});

// ===========================================================================
// (5) Chain-verify passes over the raw on-disk receipts (per-node slice).
// ===========================================================================

describe("press-desk — (5) chain-verifies", () => {
  it("every node's prev-linked chain verifies over the raw receipts.json", () => {
    const receipts = rawReceipts(COMMITTED);
    const byNode = new Map<string, LedgerReceipt[]>();
    for (const r of receipts) {
      (byNode.get(r.node) ?? byNode.set(r.node, []).get(r.node)!).push(r);
    }
    expect(byNode.size).toBeGreaterThan(0);
    for (const [node, chain] of byNode) {
      const result = verifyReceiptChain(chain);
      expect(result.ok, `chain for ${node} must verify`).toBe(true);
    }
  });
});

// ===========================================================================
// (2) Cold-start renders all; an identical re-wake SKIPS all; a skip
//     propagates nothing and wakes nothing — driven through the REAL reconciler
//     on a minimal 2-node DAG mirroring this example's gateway -> responsibility
//     edge.
// ===========================================================================

describe("press-desk — (2) cold renders, quiet re-wake skips, contract edit re-renders", () => {
  it("a quiet re-wake skips (fresh flat); a contract_fingerprint edit renders + propagates", () => {
    withTempDir((dir) => {
      const storage = createFileSystemStorageAdapter({ directory: dir });
      const ledger = createFileSystemReceiptLedger({ storage });

      const render = (text: string) => (ctx: RenderContext) => ({
        world_model: files({ "out.txt": textFile(text) }),
        cost: {
          provider: "none",
          model: "fake",
          tokens: { fresh: 1, reused: 0 },
          surprise_cause: ctx.wake.source,
        },
      });

      const topo = (sourceFp: string): ReconcilerTopology => ({
        topology: {
          nodes: [
            { node: "inbox", contract_fingerprint: sourceFp, wake_source: "external" },
            { node: "brief", contract_fingerprint: "fp-brief", wake_source: "input" },
          ],
          edges: [{ subscriber: "brief", producer: "inbox", facet: ATOMIC_FACET }],
          entry_points: ["inbox"],
          acyclic: true,
        },
        contract_fingerprints: { inbox: sourceFp, brief: "fp-brief" },
      });

      const dag = mountDag({
        topology: topo("fp-inbox"),
        mounts: {
          inbox: { render: render("v1") },
          brief: { render: render("brief of v1") },
        },
        ledger,
      });

      const cold = dag.ingest("inbox");
      expect(cold.map((r) => `${r.node}:${r.disposition}`).sort()).toEqual([
        "brief:rendered",
        "inbox:rendered",
      ]);

      const quiet = dag.ingest("inbox");
      expect(quiet.map((r) => `${r.node}:${r.disposition}`)).toEqual([
        "inbox:skipped",
      ]);
      expect(createReplaySession({ ledger }).costRollup.total.fresh).toBe(2);

      const dag2 = mountDag({
        topology: topo("fp-inbox-v2"),
        mounts: {
          inbox: { render: render("v2") },
          brief: { render: render("brief of v2") },
        },
        ledger,
      });
      const moved = dag2.ingest("inbox");
      expect(moved.map((r) => `${r.node}:${r.disposition}`).sort()).toEqual([
        "brief:rendered",
        "inbox:rendered",
      ]);
      expect(createReplaySession({ ledger }).costRollup.total.fresh).toBe(4);
    });
  });
});

// ===========================================================================
// THE TENETS: the human gate holds (needs_human + auto_reply:false) and the
// public projection never carries sender PII. Plus: the PR-blast dark lane.
// Driven over a FRESH generation of the real reconciler, asserted off the
// persisted ledger + published truth.
// ===========================================================================

describe("press-desk — THE TENETS: human gate + privacy projection", () => {
  it("THE GATE: a HIGH-importance inquiry drives the briefing to status needs_human with auto_reply === false", () => {
    withTempDir((dir) => {
      generatePressDeskExample({ stateDir: dir });

      // The high-importance partnership filter renders a qualified inquiry.
      const session = openSession(dir);
      const highRendered = session.receipts.filter(
        (r) => r.node === HIGH_FILTER && r.status === "rendered",
      );
      expect(highRendered.length).toBeGreaterThanOrEqual(1);

      // The terminal briefing's PUBLISHED truth: the gate held.
      const brief = readPublishedTruth(dir, BRIEFING);
      expect(brief).not.toBeNull();
      expect(brief!["status"]).toBe("needs_human"); // stopped at the human gate
      expect(brief!["auto_reply"]).toBe(false); // the load-bearing safety invariant
      expect(brief!["human_review_required"]).toBe(true);

      // The gate is also reflected inside the public projection (without leaking who).
      const pub = brief!["public"] as Record<string, unknown>;
      expect(pub["status"]).toBe("needs_human");
      expect(pub["gated"]).toBe(true);

      // The briefing NEVER takes an outward action: there is no `sent`/`replied`
      // truth — the system only ever drafts + packages.
      expect(brief!["auto_reply"]).not.toBe(true);
    });
  });

  it("THE PROJECTION: the public projection contains NONE of the raw sender PII present in the owner-only view", () => {
    withTempDir((dir) => {
      generatePressDeskExample({ stateDir: dir });
      const brief = readPublishedTruth(dir, BRIEFING);
      expect(brief).not.toBeNull();

      const owner = brief!["owner_view"] as {
        items: Record<string, unknown>[];
      };
      const pub = brief!["public"] as { items: Record<string, unknown>[] };

      // Collect every raw PII string the owner-only view holds.
      const piiStrings: string[] = [];
      for (const item of owner.items) {
        piiStrings.push(String(item["sender_name"]));
        piiStrings.push(String(item["sender_email"]));
      }
      expect(piiStrings.length).toBeGreaterThan(0);
      // Sanity: the owner view DOES carry concrete PII.
      expect(piiStrings).toContain("Priya Ramaswamy");
      expect(piiStrings).toContain("priya@apex-ventures.example");

      // The public projection, serialized whole, contains NONE of those strings —
      // PII is stripped by construction (it never enters the public slice).
      const publicJson = JSON.stringify(pub);
      for (const pii of piiStrings) {
        expect(
          publicJson.includes(pii),
          `public projection must not leak sender PII: ${pii}`,
        ).toBe(false);
      }
      // And structurally: no public item carries a sender_name / sender_email key.
      for (const item of pub.items) {
        expect(Object.keys(item)).not.toContain("sender_name");
        expect(Object.keys(item)).not.toContain("sender_email");
      }
    });
  });

  it("THE DARK LANE: an irrelevant PR blast keeps its `qualified` facet NULL and never wakes the register", () => {
    withTempDir((dir) => {
      generatePressDeskExample({ stateDir: dir });
      const session = openSession(dir);
      const topology = readTopology(dir);

      // The PR-blast filter renders, but its qualified slice is null (dark).
      const blastRendered = session.receipts.filter(
        (r) => r.node === BLAST_FILTER && r.status === "rendered",
      );
      expect(blastRendered.length).toBeGreaterThanOrEqual(1);
      const blastTruth = readPublishedTruth(dir, BLAST_FILTER);
      expect(blastTruth).not.toBeNull();
      expect(blastTruth!["relevant"]).toBe(false);
      expect(blastTruth!["qualified"]).toBeNull();

      // The blast filter renders TWICE: once at cold-boot (the email is absent →
      // qualified null, a first-ever move of the facet), and once when the actual
      // PR blast is delivered. The DELIVERY render must keep `qualified` STILL —
      // the slice was null and stays null — so it never lights the register. We
      // assert the dark lane on the LAST blast-filter render (the delivery), and
      // that no blast-filter render ever propagates to the register.
      const blastIdxs: number[] = [];
      for (let i = 0; i < session.receipts.length; i++) {
        const r = session.receipts[i]!;
        if (r.node === BLAST_FILTER && r.status === "rendered") blastIdxs.push(i);
      }
      expect(blastIdxs.length).toBeGreaterThanOrEqual(2);
      // The delivery render (the last one) leaves `qualified` UNMOVED — the dark
      // lane: re-delivering an irrelevant blast moves nothing.
      const deliveryIdx = blastIdxs[blastIdxs.length - 1]!;
      expect(session.movedFacetsByIndex[deliveryIdx]!.has("qualified")).toBe(
        false,
      );
      // No blast-filter render EVER lights the register (qualified is always the
      // NULL token, so it never matches the register's `qualified` subscription
      // moving) — the dark lane at the propagation seam.
      for (const i of blastIdxs) {
        const r = session.receipts[i]!;
        const moved = session.movedFacetsByIndex[i]!;
        const targets = propagationTargets({
          topology,
          producer: BLAST_FILTER,
          movedFacets: moved,
          wakeRef: r.content_hash,
        });
        // The register only wakes if the `qualified` facet's NULL token actually
        // changed value. On the delivery (no change) it stays dark.
        if (!moved.has("qualified")) {
          expect(targets.map((t) => t.node)).not.toContain(REGISTER);
        }
      }
      // And the register never RENDERS off the blast: it renders exactly twice
      // (cold-boot + the partner2 HIGH delivery), never in response to the blast.
      const registerRenders = session.receipts.filter(
        (r) => r.node === REGISTER && r.status === "rendered",
      );
      expect(registerRenders.length).toBe(2);
    });
  });

  it("the cost meter: skips carry zero fresh; the self-tick floor burns nothing; fresh accumulates", () => {
    withTempDir((dir) => {
      generatePressDeskExample({ stateDir: dir });
      const session = openSession(dir);
      const skips = session.receipts.filter((r) => r.status === "skipped");
      expect(skips.length).toBeGreaterThan(0);
      for (const s of skips) expect(s.cost.tokens.fresh).toBe(0);
      const selfs = session.receipts.filter((r) => r.wake.source === "self");
      expect(selfs.length).toBeGreaterThanOrEqual(1);
      for (const s of selfs) expect(s.cost.tokens.fresh).toBe(0);
      expect(session.costRollup.total.fresh).toBeGreaterThan(0);
      const byCause = session.costRollup.byCause;
      const summed =
        byCause.input.fresh + byCause.self.fresh + byCause.external.fresh;
      expect(summed).toBe(session.costRollup.total.fresh);
    });
  });
});

// ===========================================================================
// (6) Byte-deterministic regeneration: two fresh generations are byte-identical,
//     and they match the COMMITTED replay/ bytes (the strong drift guard).
// ===========================================================================

describe("press-desk — (6) byte-deterministic", () => {
  it("two regenerations yield identical receipts.json / topology.json / labels.json", () => {
    withTempDir((a) =>
      withTempDir((b) => {
        generatePressDeskExample({ stateDir: a });
        generatePressDeskExample({ stateDir: b });
        for (const rel of [
          "receipts.json",
          "compile/topology.json",
          "compile/labels.json",
        ]) {
          expect(readFileSync(join(a, rel), "utf8")).toBe(
            readFileSync(join(b, rel), "utf8"),
          );
        }
      }),
    );
  });

  it("a fresh generation matches the COMMITTED replay/ bytes", () => {
    withTempDir((dir) => {
      generatePressDeskExample({ stateDir: dir });
      for (const rel of [
        "receipts.json",
        "beats.json",
        "compile/topology.json",
        "compile/labels.json",
      ]) {
        expect(
          readFileSync(join(dir, rel), "utf8"),
          `${rel} must match the committed bytes`,
        ).toBe(readFileSync(join(COMMITTED, rel), "utf8"));
      }
    });
  });
});
