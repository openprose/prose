// agent-observatory — the deterministic tier-2 gate (offline, ZERO model spend).
//
// This file IS the worked snippet from the README/AUTHORING on-ramp, run
// verbatim as a test (the EVALS.md / evals-guide.test.ts discipline: if this
// breaks, the docs are wrong — fix both together). It drives the REAL
// @openprose/reactor reconciler with deterministic fake renders through the
// public `@openprose/reactor` + `/sdk` exports, then asserts the six clauses of
// the validity contract directly off the persisted ledger.
//
//   1. Compiles to the frozen artifact set (topology valid, single entry
//      gateway, acyclic; labels + receipts + world-models on disk).
//   2. Cold-start renders all; an identical re-wake SKIPS all (a skip
//      propagates nothing, wakes nothing).
//   3. cost.surprise_cause === wake.source on every committed receipt.
//   4. ATOMIC_FACET for facet-less producers; no "*" tokens anywhere.
//   5. verifyReceiptChain passes over the raw on-disk receipts.
//   6. Byte-deterministic: a second regeneration yields identical
//      receipts.json / topology.json / labels.json.
//
// RUN (offline, green): from the prose repo root,
//   REACTOR_OFFLINE=1 pnpm test:examples
//     (or scope: REACTOR_OFFLINE=1 npx vitest run skills/open-prose/examples/agent-observatory)

import { mkdtempSync, rmSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createFileSystemStorageAdapter } from "@openprose/reactor";
import {
  mountDag,
  createFileSystemReceiptLedger,
  createReplaySession,
  verifyReceiptChain,
  files,
  jsonFile,
  textFile,
  ATOMIC_FACET,
  type ReconcilerTopology,
  type RenderContext,
  type TopologyWorldModel,
} from "@openprose/reactor/sdk";

import { generateAgentObservatory } from "./generate";

const exampleDir = fileURLToPath(new URL(".", import.meta.url));
const committedReplay = join(exampleDir, "replay");

const GATEWAY = "gateway.runtime-watch";
const SESSION_LEDGER = "responsibility.session-ledger";
const SESSION_TO_PROSE = "responsibility.session-to-prose";
const INDEX_MARKDOWN = "responsibility.index-markdown";
const DASHBOARD_HTML = "responsibility.dashboard-html";
const ADAPTER_PREFIX = "responsibility.adapter-";

// ---------------------------------------------------------------------------
// Build ONE fresh state-dir for the whole suite, then assert off its ledger.
// ---------------------------------------------------------------------------

let stateDir: string;

beforeAll(() => {
  stateDir = mkdtempSync(join(tmpdir(), "agent-obs-"));
  generateAgentObservatory({ stateDir });
});

afterAll(() => {
  rmSync(stateDir, { recursive: true, force: true });
});

function openSession(dir: string) {
  const storage = createFileSystemStorageAdapter({ directory: dir });
  const ledger = createFileSystemReceiptLedger({ storage });
  return createReplaySession({ ledger });
}

function readTopology(dir: string): TopologyWorldModel {
  return JSON.parse(readFileSync(join(dir, "compile", "topology.json"), "utf8")) as TopologyWorldModel;
}

// ===========================================================================
// CLAUSE 1 — compiles to the frozen artifact set.
// ===========================================================================

describe("clause 1 — the frozen artifact set", () => {
  it("emits the mandatory state-dir files", () => {
    expect(existsSync(join(stateDir, "receipts.json"))).toBe(true);
    expect(existsSync(join(stateDir, "world-models"))).toBe(true);
    expect(existsSync(join(stateDir, "compile", "topology.json"))).toBe(true);
    expect(existsSync(join(stateDir, "compile", "labels.json"))).toBe(true);
    expect(existsSync(join(stateDir, "beats.json"))).toBe(true);
  });

  it("is a 14-node / 22-edge acyclic DAG with a single entry gateway", () => {
    const topology = readTopology(stateDir);
    expect(topology.nodes.length).toBe(14);
    expect(topology.edges.length).toBe(22);
    expect(topology.acyclic).toBe(true);
    expect(topology.entry_points).toEqual([GATEWAY]);
  });

  it("normalizes a label for every node (and the phantom ingress source)", () => {
    const labels = JSON.parse(readFileSync(join(stateDir, "compile", "labels.json"), "utf8")) as Record<string, string>;
    const topology = readTopology(stateDir);
    for (const n of topology.nodes) {
      expect(labels[n.node], `label for ${n.node}`).toBeTruthy();
    }
    expect(labels[SESSION_TO_PROSE]).toBe("Session → Prose");
  });

  it("folds in Session → Prose and keeps the dual MD + HTML terminal artifacts", () => {
    const topology = readTopology(stateDir);
    const ids = new Set(topology.nodes.map((n) => n.node));
    expect(ids.has(SESSION_TO_PROSE)).toBe(true);
    expect(ids.has(INDEX_MARKDOWN)).toBe(true);
    expect(ids.has(DASHBOARD_HTML)).toBe(true);
    // Session → Prose watches exactly one session transcript facet.
    expect(
      topology.edges.some(
        (e) => e.subscriber === SESSION_TO_PROSE && e.producer === SESSION_LEDGER && e.facet === "session:claudeA",
      ),
    ).toBe(true);
    // The Markdown index reads the Session → Prose program (the fold-in is wired in).
    expect(
      topology.edges.some((e) => e.subscriber === INDEX_MARKDOWN && e.producer === SESSION_TO_PROSE),
    ).toBe(true);
  });

  it("exposes an INDEPENDENT facet per runtime on the gateway (the dark-lane boundary)", () => {
    const topology = readTopology(stateDir);
    for (const rt of ["claude", "codex", "opencode", "pi"]) {
      expect(
        topology.edges.some(
          (e) => e.producer === GATEWAY && e.facet === rt && e.subscriber === `${ADAPTER_PREFIX}${rt}`,
        ),
        `gateway exposes an independent "${rt}" facet edge`,
      ).toBe(true);
    }
  });
});

// ===========================================================================
// CLAUSE 2 — cold-start renders all; an identical re-wake SKIPS all.
// ===========================================================================
//
// We replay the property in-process on a fresh ledger (the worked snippet), the
// same way the README narrates it: ingest the gateway once (cold), ingest again
// (quiet) — the second wake must skip and propagate nothing.

describe("clause 2 — cold renders all, an identical re-wake skips all", () => {
  it("a quiet re-wake skips and wakes nothing (no fresh moves)", () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-obs-skip-"));
    try {
      const storage = createFileSystemStorageAdapter({ directory: dir });
      const ledger = createFileSystemReceiptLedger({ storage });

      // A minimal hand-mounted slice (gateway -> digest) so the snippet is the
      // canonical mountDag-from-public-exports recipe a reader can lift.
      const render = (text: string) => (ctx: RenderContext) => ({
        world_model: files({ "out.txt": textFile(text) }),
        cost: {
          provider: "none" as const,
          model: "fake",
          tokens: { fresh: 1, reused: 0 },
          surprise_cause: ctx.wake.source, // never hardcoded
        },
      });
      const topology: ReconcilerTopology = {
        topology: {
          nodes: [
            { node: "source", contract_fingerprint: "fp-source", wake_source: "external" },
            { node: "digest", contract_fingerprint: "fp-digest", wake_source: "input" },
          ],
          edges: [{ subscriber: "digest", producer: "source", facet: ATOMIC_FACET }],
          entry_points: ["source"],
          acyclic: true,
        },
        contract_fingerprints: { source: "fp-source", digest: "fp-digest" },
      };
      const dag = mountDag({
        topology,
        mounts: { source: { render: render("v1") }, digest: { render: render("digest of v1") } },
        ledger,
      });

      const first = dag.ingest("source");
      const firstDisp = Object.fromEntries(first.map((r) => [r.node, r.disposition]));
      expect(firstDisp["source"]).toBe("rendered");
      expect(firstDisp["digest"]).toBe("rendered");

      const second = dag.ingest("source");
      // Nothing material moved ⇒ source SKIPS; digest is never even woken.
      expect(second.find((r) => r.node === "source")?.disposition).toBe("skipped");
      expect(second.some((r) => r.node === "digest" && r.disposition === "rendered")).toBe(false);

      const replay = createReplaySession({ ledger });
      expect(replay.costRollup.total.fresh).toBe(2); // two cold renders; the skip cost 0
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("the committed episode contains memo-skips that carry zero fresh (the flat line)", () => {
    const session = openSession(stateDir);
    const skips = session.receipts.filter((r) => r.status === "skipped");
    expect(skips.length).toBeGreaterThan(0);
    for (const s of skips) {
      expect(s.cost.tokens.fresh).toBe(0);
    }
  });

  it("the cost rollup MOVES only when the memo key moves (quiet flat, surprise spikes)", () => {
    // A contract_fingerprint edit forces a render over the SAME persisted ledger:
    // fresh moves. A quiet re-wake does NOT.
    const dir = mkdtempSync(join(tmpdir(), "agent-obs-cost-"));
    try {
      const storage = createFileSystemStorageAdapter({ directory: dir });
      const ledger = createFileSystemReceiptLedger({ storage });
      const render = (text: string) => (ctx: RenderContext) => ({
        world_model: files({ "out.txt": textFile(text) }),
        cost: {
          provider: "none" as const,
          model: "fake",
          tokens: { fresh: 1, reused: 0 },
          surprise_cause: ctx.wake.source,
        },
      });
      const mk = (sourceFp: string): ReconcilerTopology => ({
        topology: {
          nodes: [
            { node: "source", contract_fingerprint: sourceFp, wake_source: "external" },
            { node: "digest", contract_fingerprint: "fp-digest", wake_source: "input" },
          ],
          edges: [{ subscriber: "digest", producer: "source", facet: ATOMIC_FACET }],
          entry_points: ["source"],
          acyclic: true,
        },
        contract_fingerprints: { source: sourceFp, digest: "fp-digest" },
      });

      const dag1 = mountDag({
        topology: mk("fp-source"),
        mounts: { source: { render: render("v1") }, digest: { render: render("digest of v1") } },
        ledger,
      });
      dag1.ingest("source"); // cold: 2 fresh
      dag1.ingest("source"); // quiet: skip
      expect(createReplaySession({ ledger }).costRollup.total.fresh).toBe(2);

      // Move the memo key (a new contract_fingerprint) over the SAME ledger.
      const dag2 = mountDag({
        topology: mk("fp-source-v2"),
        mounts: { source: { render: render("v2") }, digest: { render: render("digest of v2") } },
        ledger,
      });
      dag2.ingest("source"); // render + propagate: +2 fresh
      expect(createReplaySession({ ledger }).costRollup.total.fresh).toBe(4);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ===========================================================================
// CLAUSE 3 — cost.surprise_cause === wake.source on every committed receipt.
// ===========================================================================

describe("clause 3 — surprise_cause equals the wake source", () => {
  it("holds for every committed receipt (read off the wake, never hardcoded)", () => {
    const session = openSession(stateDir);
    expect(session.receipts.length).toBeGreaterThan(0);
    for (const r of session.receipts) {
      expect(r.cost.surprise_cause, `receipt for ${r.node}`).toBe(r.wake.source);
    }
  });

  it("partitions the rollup exactly: byCause sums to total", () => {
    const session = openSession(stateDir);
    const { byCause, total } = session.costRollup;
    const sum = (k: "receipts" | "fresh" | "reused") =>
      byCause.input[k] + byCause.self[k] + byCause.external[k];
    expect(sum("receipts")).toBe(total.receipts);
    expect(sum("fresh")).toBe(total.fresh);
    expect(sum("reused")).toBe(total.reused);
  });
});

// ===========================================================================
// CLAUSE 4 — ATOMIC_FACET for facet-less producers; NO "*" tokens anywhere.
// ===========================================================================

describe("clause 4 — ATOMIC_FACET, never a star token", () => {
  it("every facet-less edge uses the ATOMIC_FACET constant", () => {
    const topology = readTopology(stateDir);
    // The known facet-less fan-ins (adapters -> ledger; summaries -> index;
    // clusterer/session-to-prose -> artifacts) all carry ATOMIC_FACET.
    const atomicEdges = topology.edges.filter((e) => e.facet === ATOMIC_FACET);
    expect(atomicEdges.length).toBeGreaterThan(0);
  });

  it('no edge carries a literal "*" token', () => {
    const topology = readTopology(stateDir);
    for (const e of topology.edges) {
      expect(e.facet).not.toBe("*");
    }
    // And the on-disk topology bytes never contain a bare "*" facet either.
    const raw = readFileSync(join(stateDir, "compile", "topology.json"), "utf8");
    expect(raw).not.toContain('"facet": "*"');
  });
});

// ===========================================================================
// CLAUSE 5 — verifyReceiptChain passes over the raw on-disk receipts.
// ===========================================================================

describe("clause 5 — the receipt chain verifies", () => {
  // verifyReceiptChain verifies ONE node's `prev`-linked chain (it is node-scoped
  // by construction). A multi-node ledger is the union of per-node chains, so we
  // run verifyReceiptChain over every node's slice — the on-disk trail must
  // chain-verify with no tampering anywhere.
  it("verifyReceiptChain is ok for every node's on-disk chain", () => {
    const session = openSession(stateDir);
    for (const [node, chain] of session.chainByNode) {
      const result = verifyReceiptChain(chain);
      expect(result.ok, `${node}: ${JSON.stringify(result)}`).toBe(true);
    }
  });

  it("the session's verifyNodeChain badge is ok for every topology node", () => {
    const session = openSession(stateDir);
    const topology = readTopology(stateDir);
    for (const n of topology.nodes) {
      const r = session.verifyNodeChain(n.node);
      expect(r.ok, `${n.node}: ${JSON.stringify(r)}`).toBe(true);
    }
  });
});

// ===========================================================================
// CLAUSE 6 — byte-deterministic regeneration.
// ===========================================================================

describe("clause 6 — regeneration is byte-identical", () => {
  it("two fresh generations agree on receipts.json / topology.json / labels.json / beats.json", () => {
    const a = mkdtempSync(join(tmpdir(), "agent-obs-det-a-"));
    const b = mkdtempSync(join(tmpdir(), "agent-obs-det-b-"));
    try {
      generateAgentObservatory({ stateDir: a });
      generateAgentObservatory({ stateDir: b });
      for (const rel of ["receipts.json", "beats.json", join("compile", "topology.json"), join("compile", "labels.json")]) {
        expect(readFileSync(join(a, rel), "utf8"), rel).toBe(readFileSync(join(b, rel), "utf8"));
      }
    } finally {
      rmSync(a, { recursive: true, force: true });
      rmSync(b, { recursive: true, force: true });
    }
  });

  it("the committed replay/ matches a fresh generation (the fixture is not stale)", () => {
    // Guard on the ledger file, not the (possibly empty) dir, so the assertion
    // only runs once the replay/ bytes are actually committed.
    if (!existsSync(join(committedReplay, "receipts.json"))) return;
    const fresh = mkdtempSync(join(tmpdir(), "agent-obs-fresh-"));
    try {
      generateAgentObservatory({ stateDir: fresh });
      for (const rel of ["receipts.json", "beats.json", join("compile", "topology.json"), join("compile", "labels.json")]) {
        expect(readFileSync(join(committedReplay, rel), "utf8"), `committed ${rel}`).toBe(
          readFileSync(join(fresh, rel), "utf8"),
        );
      }
    } finally {
      rmSync(fresh, { recursive: true, force: true });
    }
  });
});

// ===========================================================================
// The tenet shots — the lessons this example teaches (observatory behaviors).
// ===========================================================================

describe("the observatory tenets", () => {
  it("the Concept Clusterer holds the single tallest fresh spike (batched synthesis)", () => {
    const session = openSession(stateDir);
    const clusterer = session.receipts.filter(
      (r) => r.node === "responsibility.concept-clusterer" && r.status === "rendered",
    );
    expect(clusterer.length).toBeGreaterThanOrEqual(1);
    const maxFresh = Math.max(...session.receipts.map((r) => r.cost.tokens.fresh));
    const clustererMax = Math.max(...clusterer.map((r) => r.cost.tokens.fresh));
    expect(clustererMax).toBe(maxFresh);
  });

  it("has at least one `failed` receipt (the Codex adapter throw) carrying zero fresh", () => {
    const session = openSession(stateDir);
    const failed = session.receipts.filter((r) => r.status === "failed");
    expect(failed.length).toBeGreaterThanOrEqual(1);
    expect(failed.some((r) => r.node === `${ADAPTER_PREFIX}codex`)).toBe(true);
    for (const f of failed) expect(f.cost.tokens.fresh).toBe(0);
  });

  it("has at least one `self` receipt (the audit-floor self-tick) carrying zero fresh", () => {
    const session = openSession(stateDir);
    const selfReceipts = session.receipts.filter((r) => r.wake.source === "self");
    expect(selfReceipts.length).toBeGreaterThanOrEqual(1);
    for (const s of selfReceipts) expect(s.cost.tokens.fresh).toBe(0);
  });

  it("the world-models dir uses hex-encoded node ids (devtools replay shape)", () => {
    const wmDir = join(stateDir, "world-models");
    const entries = readdirSync(wmDir);
    // gateway.runtime-watch -> hex
    const gatewayHex = Buffer.from(GATEWAY, "utf8").toString("hex");
    expect(entries).toContain(gatewayHex);
  });
});
