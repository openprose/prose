// feedback-pulse — the deterministic tier-2 gate (offline, ZERO model spend).
//
// This file drives the REAL `@openprose/reactor` reconciler through the public
// exports, asserts the validity contract off the persisted ledger, and proves
// this example's tenet — SELF-DRIVEN `valid_until` freshness: a maintained brief
// refreshes on a weekly cadence with ZERO tokens when the inbox is quiet, and a
// theme facet moving (pricing) never wakes a consumer subscribed to a different
// theme. If this test breaks, the example is invalid.
//
// It asserts, all offline:
//   1. Compiles to the frozen artifact set (topology valid, single entry, acyclic).
//   2. Cold-start renders all; an identical re-wake skips all (skip propagates
//      nothing, wakes nothing).
//   3. cost.surprise_cause === wake.source on every committed receipt.
//   4. ATOMIC_FACET for facet-less producers; no "*" tokens anywhere.
//   5. verifyReceiptChain passes over the raw on-disk receipts.
//   6. Byte-deterministic regeneration (receipts/topology/labels identical).
//   + the example's tenet: self-driven freshness floor + per-theme isolation.

import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createFileSystemStorageAdapter,
} from "@openprose/reactor";
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
  propagationTargets,
  type ReconcilerTopology,
  type TopologyWorldModel,
} from "@openprose/reactor/internals";
import {
  FileSystemWorldModelStore,
  readTextFile,
} from "@openprose/reactor/adapters";

import { generateFeedbackPulseExample } from "./generate";

const GATEWAY = "gateway.feedback-inbox";
const VOICE = "responsibility.voice-of-customer";
const PULSE = "responsibility.weekly-pulse";
const TAGGER_PREFIX = "responsibility.theme-tagger-";
const THEMES = ["pricing", "performance", "onboarding", "integrations"] as const;

const COMMITTED = join(__dirname, "replay");

function withTempDir<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "feedback-pulse-"));
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

// ===========================================================================
// (1) Compiles to the frozen artifact set — topology valid, single entry,
//     acyclic — and the committed replay/ matches a fresh generation.
// ===========================================================================

describe("feedback-pulse — (1) frozen artifact set", () => {
  it("the committed topology is a valid TopologyWorldModel: single entry gateway, acyclic", () => {
    const topology = readTopology(COMMITTED);
    expect(topology.acyclic).toBe(true);
    expect(topology.entry_points).toEqual([GATEWAY]);
    // 7 real nodes: gateway + 4 theme-taggers + voice-of-customer + weekly-pulse.
    // (The phantom ingress source is NOT a topology node.)
    expect(topology.nodes.length).toBe(7);
    const ids = new Set(topology.nodes.map((n) => n.node));
    const SOURCE = "ingress.feedback-feed"; // the phantom external feed (not a node)
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
    expect(() => readFileSync(join(COMMITTED, "compile", "labels.json"))).not.toThrow();
    expect(() => readFileSync(join(COMMITTED, "beats.json"))).not.toThrow();
    expect(() => readFileSync(join(COMMITTED, "receipts.json"))).not.toThrow();
    const hexPulse = Buffer.from(PULSE, "utf8").toString("hex");
    expect(() =>
      readFileSync(join(COMMITTED, "world-models", hexPulse, "published.json")),
    ).not.toThrow();
  });
});

// ===========================================================================
// (4) ATOMIC_FACET for facet-less producers; NO "*" tokens anywhere.
// ===========================================================================

describe("feedback-pulse — (4) ATOMIC_FACET, never \"*\"", () => {
  it("facet-less fan-in edges subscribe to the exported ATOMIC_FACET constant", () => {
    const topology = readTopology(COMMITTED);
    // The aggregator fans in from each tagger with no named facet -> ATOMIC_FACET.
    const fanIn = topology.edges.filter(
      (e) => e.subscriber === VOICE && e.producer.startsWith(TAGGER_PREFIX),
    );
    expect(fanIn.length).toBe(4);
    for (const e of fanIn) expect(e.facet).toBe(ATOMIC_FACET);
  });

  it("the weekly pulse subscribes to the rollup facet AND the gateway's week clock", () => {
    const topology = readTopology(COMMITTED);
    const inbound = topology.edges.filter((e) => e.subscriber === PULSE);
    const facetsByProducer = Object.fromEntries(inbound.map((e) => [e.producer, e.facet]));
    expect(facetsByProducer[VOICE]).toBe("rollup");
    expect(facetsByProducer[GATEWAY]).toBe("week");
  });

  it("no \"*\" wildcard token appears in any committed artifact", () => {
    for (const rel of ["compile/topology.json", "compile/labels.json", "receipts.json"]) {
      const txt = readFileSync(join(COMMITTED, rel), "utf8");
      expect(txt.includes('"*"')).toBe(false);
    }
  });
});

// ===========================================================================
// (3) cost.surprise_cause === wake.source on every committed receipt.
// ===========================================================================

describe("feedback-pulse — (3) surprise_cause === wake.source", () => {
  it("holds on every committed receipt (read off the wake, never hardcoded)", () => {
    for (const r of rawReceipts(COMMITTED)) {
      expect(r.cost.surprise_cause).toBe(r.wake.source);
    }
  });
});

// ===========================================================================
// (5) Chain-verify passes over the raw on-disk receipts (per-node slice).
// ===========================================================================

describe("feedback-pulse — (5) chain-verifies", () => {
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
//     propagates nothing and wakes nothing — driven through the REAL reconciler.
// ===========================================================================

describe("feedback-pulse — (2) cold renders, quiet re-wake skips, contract edit re-renders", () => {
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
            { node: "pulse", contract_fingerprint: "fp-pulse", wake_source: "input" },
          ],
          edges: [{ subscriber: "pulse", producer: "inbox", facet: ATOMIC_FACET }],
          entry_points: ["inbox"],
          acyclic: true,
        },
        contract_fingerprints: { inbox: sourceFp, pulse: "fp-pulse" },
      });

      const dag = mountDag({
        topology: topo("fp-inbox"),
        mounts: {
          inbox: { render: render("v1") },
          pulse: { render: render("pulse of v1") },
        },
        ledger,
      });

      const cold = dag.ingest("inbox");
      expect(cold.map((r) => `${r.node}:${r.disposition}`).sort()).toEqual([
        "inbox:rendered",
        "pulse:rendered",
      ]);

      const quiet = dag.ingest("inbox");
      expect(quiet.map((r) => `${r.node}:${r.disposition}`)).toEqual(["inbox:skipped"]);
      expect(createReplaySession({ ledger }).costRollup.total.fresh).toBe(2);

      const dag2 = mountDag({
        topology: topo("fp-inbox-v2"),
        mounts: {
          inbox: { render: render("v2") },
          pulse: { render: render("pulse of v2") },
        },
        ledger,
      });
      const moved = dag2.ingest("inbox");
      expect(moved.map((r) => `${r.node}:${r.disposition}`).sort()).toEqual([
        "inbox:rendered",
        "pulse:rendered",
      ]);
      expect(createReplaySession({ ledger }).costRollup.total.fresh).toBe(4);
    });
  });
});

// ===========================================================================
// THE TENET: SELF-DRIVEN `valid_until` freshness + per-theme isolation. Driven
// over a FRESH generation of the real reconciler (the whole episode), asserted
// off the persisted ledger.
// ===========================================================================

describe("feedback-pulse — THE TENET: self-driven freshness + theme isolation", () => {
  it("the weekly pulse carries a self-sourced continuity tick; a self-tick with unmoved inputs is a zero-fresh skip", () => {
    withTempDir((dir) => {
      generateFeedbackPulseExample({ stateDir: dir });
      const session = openSession(dir);

      // At least one self-sourced receipt lands on the weekly pulse (the
      // valid_until continuity tick / audit floor).
      const pulseSelfs = session.receipts.filter(
        (r) => r.node === PULSE && r.wake.source === "self",
      );
      expect(pulseSelfs.length).toBeGreaterThanOrEqual(1);

      // EVERY self-sourced receipt (the continuity ticks) is a zero-fresh skip —
      // a self wake with unmoved inputs burns nothing (the audit floor).
      const selfs = session.receipts.filter((r) => r.wake.source === "self");
      expect(selfs.length).toBeGreaterThanOrEqual(1);
      for (const s of selfs) {
        expect(s.status).toBe("skipped");
        expect(s.cost.tokens.fresh).toBe(0);
      }
    });
  });

  it("the weekly refresh burns ZERO tokens: the clock advances past valid_until, the pulse re-renders, but no NEW material moved", () => {
    withTempDir((dir) => {
      generateFeedbackPulseExample({ stateDir: dir });
      const session = openSession(dir);

      // There is a RENDERED weekly-pulse receipt whose fresh cost is exactly 0 —
      // the freshness re-stamp on a quiet weekly cadence (the headline). It must
      // still carry a fresh valid_until in published truth.
      const zeroFreshRenders = session.receipts.filter(
        (r) => r.node === PULSE && r.status === "rendered" && r.cost.tokens.fresh === 0,
      );
      expect(zeroFreshRenders.length).toBeGreaterThanOrEqual(1);

      // The pulse's published truth carries the freshness fields (last_reviewed +
      // valid_until that lapses one week later) — read by reference off the store.
      const store = new FileSystemWorldModelStore({ directory: join(dir, "world-models") });
      const read = store.read(PULSE, "published");
      expect(read.ref.version).not.toBeNull();
      const truth = JSON.parse(readTextFile(read.files["truth.json"]!)) as Record<string, unknown>;
      expect(typeof truth["valid_until"]).toBe("number");
      expect(typeof truth["last_reviewed"]).toBe("number");
      // valid_until lapses exactly one week after last_reviewed.
      expect(truth["valid_until"]).toBe((truth["last_reviewed"] as number) + 1);
    });
  });

  it("theme isolation: a pricing complaint moves ONLY the pricing facet — the other three theme facets stay dark", () => {
    withTempDir((dir) => {
      generateFeedbackPulseExample({ stateDir: dir });
      const session = openSession(dir);
      const topology = readTopology(dir);

      // Find the aggregator render that introduced the pricing complaint: it moves
      // `pricing` (and `rollup`) but leaves performance/onboarding/integrations
      // BYTE-IDENTICAL — the selective-wake boundary.
      let sawPricingOnly = false;
      for (let i = 0; i < session.receipts.length; i++) {
        const r = session.receipts[i]!;
        if (r.node !== VOICE || r.status !== "rendered") continue;
        const moved = session.movedFacetsByIndex[i]!;
        // Skip the cold-boot render (it moves every theme at once).
        if (!moved.has("pricing")) continue;
        const otherThemes = THEMES.filter((t) => t !== "pricing");
        const anyOtherMoved = otherThemes.some((t) => moved.has(t));
        if (anyOtherMoved) continue; // a multi-theme frame (cold boot) — not the isolated one
        sawPricingOnly = true;

        // A hypothetical consumer subscribed to a DIFFERENT theme facet is NOT
        // woken by this move: propagation over the unmoved facets lights nothing.
        for (const t of otherThemes) {
          expect(moved.has(t)).toBe(false);
        }
        // The pulse (subscribed to rollup) IS woken, because rollup moved with the
        // real membership shift.
        const targets = propagationTargets({
          topology,
          producer: VOICE,
          movedFacets: moved,
          wakeRef: r.content_hash,
        });
        expect(targets.map((t) => t.node)).toContain(PULSE);
      }
      expect(sawPricingOnly).toBe(true);
    });
  });

  it("the dark lane: a single-message gateway delta lights <=1 tagger lane", () => {
    withTempDir((dir) => {
      generateFeedbackPulseExample({ stateDir: dir });
      const session = openSession(dir);
      const topology = readTopology(dir);
      const feedbackFacets = new Set(["f1", "f2", "f3", "f4"].map((id) => `feedback:${id}`));
      let sawSingle = false;
      for (let i = 0; i < session.receipts.length; i++) {
        const r = session.receipts[i]!;
        if (r.node !== GATEWAY || r.status !== "rendered") continue;
        const moved = session.movedFacetsByIndex[i]!;
        const movedMsgs = [...moved].filter((f) => feedbackFacets.has(f));
        if (movedMsgs.length !== 1) continue;
        sawSingle = true;
        const targets = propagationTargets({
          topology,
          producer: GATEWAY,
          movedFacets: moved,
          wakeRef: r.content_hash,
        });
        const litTaggers = targets.map((t) => t.node).filter((n) => n.startsWith(TAGGER_PREFIX));
        expect(litTaggers.length).toBeLessThanOrEqual(1);
        expect(litTaggers[0]).toBe(`${TAGGER_PREFIX}${movedMsgs[0]!.slice("feedback:".length)}`);
      }
      expect(sawSingle).toBe(true);
    });
  });

  it("the cost meter: skips carry zero fresh; the self-tick floor burns nothing; fresh accumulates", () => {
    withTempDir((dir) => {
      generateFeedbackPulseExample({ stateDir: dir });
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

describe("feedback-pulse — (6) byte-deterministic", () => {
  it("two regenerations yield identical receipts.json / topology.json / labels.json", () => {
    withTempDir((a) =>
      withTempDir((b) => {
        generateFeedbackPulseExample({ stateDir: a });
        generateFeedbackPulseExample({ stateDir: b });
        for (const rel of ["receipts.json", "compile/topology.json", "compile/labels.json"]) {
          expect(readFileSync(join(a, rel), "utf8")).toBe(readFileSync(join(b, rel), "utf8"));
        }
      }),
    );
  });

  it("a fresh generation matches the COMMITTED replay/ bytes", () => {
    withTempDir((dir) => {
      generateFeedbackPulseExample({ stateDir: dir });
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
