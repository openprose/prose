// inbox-triage — the deterministic tier-2 gate (offline, ZERO model spend).
//
// This file IS the worked example the README/AUTHORING points at: it drives the
// REAL `@openprose/reactor` reconciler through the public exports, asserts the
// validity contract off the persisted ledger, and proves this example's tenet —
// a failed receipt carries zero fresh and wakes nothing downstream; diamond dedup
// is a single wake. If this test breaks, the example is invalid.
//
// It asserts, all offline:
//   1. Compiles to the frozen artifact set (topology valid, single entry, acyclic).
//   2. Cold-start renders all; an identical re-wake skips all (skip propagates
//      nothing, wakes nothing).
//   3. cost.surprise_cause === wake.source on every committed receipt.
//   4. ATOMIC_FACET for facet-less producers; no "*" tokens anywhere.
//   5. verifyReceiptChain passes over the raw on-disk receipts.
//   6. Byte-deterministic regeneration (receipts/topology/labels identical).
//   + the example's tenet: failure isolation + diamond single-wake.

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
  propagationTargets,
  files,
  textFile,
  ATOMIC_FACET,
  type ReconcilerTopology,
  type RenderContext,
  type TopologyWorldModel,
  type LedgerReceipt,
} from "@openprose/reactor/sdk";

import { generateInboxTriageExample } from "./generate";

const GATEWAY = "gateway.inbox-stream";
const THREADER = "responsibility.threader";
const DIGEST = "responsibility.digest";
const THREAD_NEWSLETTER = "responsibility.thread-newsletter";
const ALERT_CLASSIFIER = "responsibility.classifier-bad1";
const CLASSIFIER_PREFIX = "responsibility.classifier-";

const COMMITTED = join(__dirname, "replay");

function withTempDir<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "inbox-triage-"));
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

describe("inbox-triage — (1) frozen artifact set", () => {
  it("the committed topology is a valid TopologyWorldModel: single entry gateway, acyclic", () => {
    const topology = readTopology(COMMITTED);
    expect(topology.acyclic).toBe(true);
    expect(topology.entry_points).toEqual([GATEWAY]);
    // 16 real nodes: gateway + 8 classifiers + threader + 4 thread-renders +
    // priority + digest. (The phantom ingress source is NOT a topology node.)
    expect(topology.nodes.length).toBe(16);
    const ids = new Set(topology.nodes.map((n) => n.node));
    const SOURCE = "ingress.mail-feed"; // the phantom external feed (not a node)
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
    // topology, labels, beats, receipts, world-models — present on disk.
    expect(() => readTopology(COMMITTED)).not.toThrow();
    expect(() => readFileSync(join(COMMITTED, "compile", "labels.json"))).not.toThrow();
    expect(() => readFileSync(join(COMMITTED, "beats.json"))).not.toThrow();
    expect(() => readFileSync(join(COMMITTED, "receipts.json"))).not.toThrow();
    // hex-encoded world-model dir for the digest exists.
    const hexDigest = Buffer.from(DIGEST, "utf8").toString("hex");
    expect(() =>
      readFileSync(join(COMMITTED, "world-models", hexDigest, "published.json")),
    ).not.toThrow();
  });
});

// ===========================================================================
// (4) ATOMIC_FACET for facet-less producers; NO "*" tokens anywhere.
// ===========================================================================

describe("inbox-triage — (4) ATOMIC_FACET, never \"*\"", () => {
  it("facet-less fan-in edges subscribe to the exported ATOMIC_FACET constant", () => {
    const topology = readTopology(COMMITTED);
    // The threader fans in from each classifier with no named facet -> ATOMIC_FACET.
    const fanIn = topology.edges.filter(
      (e) => e.subscriber === THREADER && e.producer.startsWith(CLASSIFIER_PREFIX),
    );
    expect(fanIn.length).toBe(8);
    for (const e of fanIn) expect(e.facet).toBe(ATOMIC_FACET);
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

describe("inbox-triage — (3) surprise_cause === wake.source", () => {
  it("holds on every committed receipt (read off the wake, never hardcoded)", () => {
    for (const r of rawReceipts(COMMITTED)) {
      expect(r.cost.surprise_cause).toBe(r.wake.source);
    }
  });
});

// ===========================================================================
// (5) Chain-verify passes over the raw on-disk receipts (per-node slice).
// ===========================================================================

describe("inbox-triage — (5) chain-verifies", () => {
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
//     (EVALS.md "drive the reconciler yourself" shape, on a minimal 2-node DAG
//     that mirrors this example's gateway -> responsibility edge.)
// ===========================================================================

describe("inbox-triage — (2) cold renders, quiet re-wake skips, contract edit re-renders", () => {
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
          // the load-bearing invariant — off the wake, never hardcoded.
          surprise_cause: ctx.wake.source,
        },
      });

      const topo = (sourceFp: string): ReconcilerTopology => ({
        topology: {
          nodes: [
            { node: "inbox", contract_fingerprint: sourceFp, wake_source: "external" },
            { node: "digest", contract_fingerprint: "fp-digest", wake_source: "input" },
          ],
          edges: [{ subscriber: "digest", producer: "inbox", facet: ATOMIC_FACET }],
          entry_points: ["inbox"],
          acyclic: true,
        },
        contract_fingerprints: { inbox: sourceFp, digest: "fp-digest" },
      });

      const dag = mountDag({
        topology: topo("fp-inbox"),
        mounts: {
          inbox: { render: render("v1") },
          digest: { render: render("digest of v1") },
        },
        ledger,
      });

      const cold = dag.ingest("inbox");
      expect(cold.map((r) => `${r.node}:${r.disposition}`).sort()).toEqual([
        "digest:rendered",
        "inbox:rendered",
      ]);

      const quiet = dag.ingest("inbox");
      // nothing moved -> inbox skips; digest is NOT even woken (skip propagates
      // nothing, wakes nothing).
      expect(quiet.map((r) => `${r.node}:${r.disposition}`)).toEqual(["inbox:skipped"]);
      expect(createReplaySession({ ledger }).costRollup.total.fresh).toBe(2);

      // a contract_fingerprint edit MOVES the memo key -> render + propagate.
      const dag2 = mountDag({
        topology: topo("fp-inbox-v2"),
        mounts: {
          inbox: { render: render("v2") },
          digest: { render: render("digest of v2") },
        },
        ledger,
      });
      const moved = dag2.ingest("inbox");
      expect(moved.map((r) => `${r.node}:${r.disposition}`).sort()).toEqual([
        "digest:rendered",
        "inbox:rendered",
      ]);
      // fresh MOVES (2 -> 4) when the contract edit forces a render.
      expect(createReplaySession({ ledger }).costRollup.total.fresh).toBe(4);
    });
  });
});

// ===========================================================================
// THE TENET: a failed receipt carries zero fresh and wakes nothing downstream;
// diamond dedup is a single wake. Driven over a FRESH generation of the real
// reconciler (the whole episode), asserted off the persisted ledger.
// ===========================================================================

describe("inbox-triage — THE TENET: failure isolation + diamond single-wake", () => {
  it("5 identical newsletters -> ONE shared thread render; a failed receipt carries zero fresh + wakes nothing; the digest still ships; recover", () => {
    withTempDir((dir) => {
      generateInboxTriageExample({ stateDir: dir });
      const session = openSession(dir);
      const topology = readTopology(dir);

      // --- DIAMOND DEDUP: >=5 newsletter copies classified; the shared thread
      // render fires EXACTLY ONCE; copies 2..5 dedup at the threader's
      // content-fingerprinted facet (a single wake out).
      const nlClassified = new Set(
        session.receipts
          .filter((r) => /^responsibility\.classifier-nl[1-5]$/.test(r.node) && r.status === "rendered")
          .map((r) => r.node),
      );
      expect(nlClassified.size).toBeGreaterThanOrEqual(5);

      const newsletterRenders = session.receipts.filter(
        (r) => r.node === THREAD_NEWSLETTER && r.status === "rendered",
      );
      expect(newsletterRenders.length).toBe(1);

      // every threader re-run that did NOT move thread:newsletter (copies 2..5)
      // must NOT re-light the shared render — the dedup, at the propagation seam.
      let dedupedFrames = 0;
      for (let i = 0; i < session.receipts.length; i++) {
        const r = session.receipts[i]!;
        if (r.node !== THREADER || r.status !== "rendered") continue;
        const moved = session.movedFacetsByIndex[i]!;
        if (moved.has("thread:newsletter")) continue; // the FIRST, collapsing render
        const targets = propagationTargets({
          topology,
          producer: THREADER,
          movedFacets: moved,
          wakeRef: r.content_hash,
        });
        expect(targets.map((t) => t.node)).not.toContain(THREAD_NEWSLETTER);
        dedupedFrames += 1;
      }
      expect(dedupedFrames).toBeGreaterThanOrEqual(4);

      // --- FAILURE ISOLATION: >=1 failed receipt (the malformed email), it is
      // the alert classifier, it carries ZERO fresh, and it WAKES NOTHING.
      const failed = session.receipts.filter((r) => r.status === "failed");
      expect(failed.length).toBeGreaterThanOrEqual(1);
      expect(failed.some((r) => r.node === ALERT_CLASSIFIER)).toBe(true);
      for (const f of failed) {
        expect(f.cost.tokens.fresh).toBe(0); // zero fresh — no work landed.
      }
      // a failed receipt moves NO facet, so it lights NO downstream lane.
      for (let i = 0; i < session.receipts.length; i++) {
        const r = session.receipts[i]!;
        if (r.status !== "failed") continue;
        const moved = session.movedFacetsByIndex[i]!;
        const targets = propagationTargets({
          topology,
          producer: r.node,
          movedFacets: moved,
          wakeRef: r.content_hash,
        });
        expect(targets.length, "a failed receipt wakes nothing downstream").toBe(0);
      }

      // the failure stays isolated: the digest NEVER fails…
      expect(session.receipts.some((r) => r.node === DIGEST && r.status === "failed")).toBe(false);
      // …and still ships after the failure (the digest still renders).
      const failIdx = session.receipts.findIndex(
        (r) => r.node === ALERT_CLASSIFIER && r.status === "failed",
      );
      const digestAfterFail = session.receipts
        .map((r, i) => ({ r, i }))
        .filter(({ r, i }) => r.node === DIGEST && r.status === "rendered" && i > failIdx);
      expect(digestAfterFail.length).toBeGreaterThanOrEqual(1);

      // --- RECOVER: a later fixed copy yields a rendered classifier receipt
      // AFTER the failure.
      const recovered = session.receipts
        .map((r, i) => ({ r, i }))
        .filter(({ r, i }) => r.node === ALERT_CLASSIFIER && r.status === "rendered" && i > failIdx);
      expect(recovered.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("the dark lane: a single-email gateway delta lights <=1 classifier lane", () => {
    withTempDir((dir) => {
      generateInboxTriageExample({ stateDir: dir });
      const session = openSession(dir);
      const topology = readTopology(dir);
      const emailFacets = new Set(
        ["nl1", "nl2", "nl3", "nl4", "nl5", "ship1", "invoice1", "bad1"].map((id) => `email:${id}`),
      );
      let sawSingle = false;
      for (let i = 0; i < session.receipts.length; i++) {
        const r = session.receipts[i]!;
        if (r.node !== GATEWAY || r.status !== "rendered") continue;
        const moved = session.movedFacetsByIndex[i]!;
        const movedEmails = [...moved].filter((f) => emailFacets.has(f));
        if (movedEmails.length !== 1) continue;
        sawSingle = true;
        const targets = propagationTargets({
          topology,
          producer: GATEWAY,
          movedFacets: moved,
          wakeRef: r.content_hash,
        });
        const lit = targets.map((t) => t.node).filter((n) => n.startsWith(CLASSIFIER_PREFIX));
        expect(lit.length).toBeLessThanOrEqual(1);
        expect(lit[0]).toBe(`${CLASSIFIER_PREFIX}${movedEmails[0]!.slice("email:".length)}`);
      }
      expect(sawSingle).toBe(true);
    });
  });

  it("the cost meter: skips carry zero fresh; the self-tick floor burns nothing; fresh accumulates", () => {
    withTempDir((dir) => {
      generateInboxTriageExample({ stateDir: dir });
      const session = openSession(dir);
      const skips = session.receipts.filter((r) => r.status === "skipped");
      expect(skips.length).toBeGreaterThan(0);
      for (const s of skips) expect(s.cost.tokens.fresh).toBe(0);
      const selfs = session.receipts.filter((r) => r.wake.source === "self");
      expect(selfs.length).toBeGreaterThanOrEqual(1);
      for (const s of selfs) expect(s.cost.tokens.fresh).toBe(0);
      expect(session.costRollup.total.fresh).toBeGreaterThan(0);
      // byCause partitions the total exactly.
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

describe("inbox-triage — (6) byte-deterministic", () => {
  it("two regenerations yield identical receipts.json / topology.json / labels.json", () => {
    withTempDir((a) =>
      withTempDir((b) => {
        generateInboxTriageExample({ stateDir: a });
        generateInboxTriageExample({ stateDir: b });
        for (const rel of ["receipts.json", "compile/topology.json", "compile/labels.json"]) {
          expect(readFileSync(join(a, rel), "utf8")).toBe(readFileSync(join(b, rel), "utf8"));
        }
      }),
    );
  });

  it("a fresh generation matches the COMMITTED replay/ bytes", () => {
    withTempDir((dir) => {
      generateInboxTriageExample({ stateDir: dir });
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
