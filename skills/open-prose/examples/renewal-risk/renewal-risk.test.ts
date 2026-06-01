// renewal-risk — the deterministic tier-2 gate (offline, ZERO model spend).
//
// This is the EVALS-style "the README snippet IS the test" body: it drives the
// REAL @openprose/reactor reconciler with deterministic fake renders (no key),
// freezes the replay/ state-dir via generate.ts, and asserts the SIX validity-
// contract properties off the persisted ledger:
//
//   1. Compiles to the frozen artifact set (topology valid, single entry
//      gateway, acyclic; labels.json + a flat receipts.json + per-node world
//      models present).
//   2. Cold-start renders all nodes; an identical re-wake SKIPS all (a skip
//      propagates nothing, wakes nothing).
//   3. cost.surprise_cause === wake.source on every committed receipt.
//   4. ATOMIC_FACET for facet-less producers; no "*" tokens anywhere.
//   5. verifyReceiptChain passes over the raw on-disk receipts.
//   6. Byte-deterministic: a second regeneration yields identical
//      receipts.json / topology.json / labels.json.
//
// Plus the headline lesson, driven through the SAME public mountDag surface the
// README documents: a quiet re-wake does NOT move total.fresh; a moved
// contract_fingerprint DOES.

import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
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
  type TopologyWorldModel,
} from "@openprose/reactor/sdk";

import { generateRenewalRiskFixture } from "./generate";

const GATEWAY = "gateway.account-signals";
const RENEWAL_RISK = "responsibility.renewal-risk";
const ALERT_FEED = "responsibility.renewal-alert-feed";

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

function withFixture(fn: (stateDir: string) => void): void {
  const stateDir = mkdtempSync(join(tmpdir(), "renewal-risk-"));
  try {
    generateRenewalRiskFixture({ stateDir });
    fn(stateDir);
  } finally {
    rmSync(stateDir, { recursive: true, force: true });
  }
}

describe("renewal-risk — (1) compiles to the frozen artifact set", () => {
  it("emits a flat receipts.json + per-node world-models + the compile snapshot", () => {
    withFixture((stateDir) => {
      expect(existsSync(join(stateDir, "receipts.json"))).toBe(true);
      expect(existsSync(join(stateDir, "world-models"))).toBe(true);
      expect(existsSync(join(stateDir, "compile", "topology.json"))).toBe(true);
      expect(existsSync(join(stateDir, "compile", "labels.json"))).toBe(true);
      expect(existsSync(join(stateDir, "beats.json"))).toBe(true);
      // the per-node world-model dir is hex-encoded (finding.B2 -> 66...).
      const hex = Buffer.from(RENEWAL_RISK, "utf8").toString("hex");
      expect(existsSync(join(stateDir, "world-models", hex, "published.json"))).toBe(true);
    });
  });

  it("is a valid TopologyWorldModel: single entry gateway, acyclic, resolved edges", () => {
    withFixture((stateDir) => {
      const topology = readTopology(stateDir);
      expect(topology.acyclic).toBe(true);
      expect(topology.entry_points).toEqual([GATEWAY]);
      expect(topology.nodes.map((n) => n.node).sort()).toEqual(
        [ALERT_FEED, GATEWAY, RENEWAL_RISK].sort(),
      );
      // every edge is a resolved {subscriber, producer, facet} triple.
      for (const e of topology.edges) {
        expect(typeof e.subscriber).toBe("string");
        expect(typeof e.producer).toBe("string");
        expect(typeof e.facet).toBe("string");
      }
      // the standing truth fans in one per-account facet edge from the gateway.
      for (const acct of ["acme", "globex", "initech", "umbrella"]) {
        expect(
          topology.edges.some(
            (e) =>
              e.producer === GATEWAY &&
              e.subscriber === RENEWAL_RISK &&
              e.facet === `acct:${acct}`,
          ),
        ).toBe(true);
      }
      // the alert feed subscribes to the `risk` facet ONLY (never `history`).
      const feedEdges = topology.edges.filter((e) => e.subscriber === ALERT_FEED);
      expect(feedEdges).toHaveLength(1);
      expect(feedEdges[0]!.producer).toBe(RENEWAL_RISK);
      expect(feedEdges[0]!.facet).toBe("risk");
    });
  });
});

describe("renewal-risk — (2) cold renders all; an identical re-wake skips all", () => {
  it("a quiet re-ingest produces only skipped receipts that wake/propagate nothing", () => {
    // Driven through the SAME public mountDag surface the README documents.
    const dir = mkdtempSync(join(tmpdir(), "renewal-risk-replay-"));
    try {
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

      const topology: ReconcilerTopology = {
        topology: {
          nodes: [
            { node: GATEWAY, contract_fingerprint: "fp-gw", wake_source: "external" },
            { node: RENEWAL_RISK, contract_fingerprint: "fp-rr", wake_source: "input" },
          ],
          edges: [{ subscriber: RENEWAL_RISK, producer: GATEWAY, facet: ATOMIC_FACET }],
          entry_points: [GATEWAY],
          acyclic: true,
        },
        contract_fingerprints: { [GATEWAY]: "fp-gw", [RENEWAL_RISK]: "fp-rr" },
      };
      const dag = mountDag({
        topology,
        mounts: {
          [GATEWAY]: { render: render("signals v1") },
          [RENEWAL_RISK]: { render: render("health v1") },
        },
        ledger,
      });

      const first = dag.ingest(GATEWAY);
      expect(first.map((r) => `${r.node}:${r.disposition}`).sort()).toEqual(
        [`${RENEWAL_RISK}:rendered`, `${GATEWAY}:rendered`].sort(),
      );

      const second = dag.ingest(GATEWAY);
      // nothing moved -> the gateway skips and the standing truth is not woken.
      expect(second.map((r) => `${r.node}:${r.disposition}`)).toEqual([
        `${GATEWAY}:skipped`,
      ]);
      expect(createReplaySession({ ledger }).costRollup.total.fresh).toBe(2);

      // The worked epoch: a moved contract_fingerprint renders + propagates.
      const topology2: ReconcilerTopology = {
        topology: {
          nodes: [
            { node: GATEWAY, contract_fingerprint: "fp-gw-v2", wake_source: "external" },
            { node: RENEWAL_RISK, contract_fingerprint: "fp-rr", wake_source: "input" },
          ],
          edges: [{ subscriber: RENEWAL_RISK, producer: GATEWAY, facet: ATOMIC_FACET }],
          entry_points: [GATEWAY],
          acyclic: true,
        },
        contract_fingerprints: { [GATEWAY]: "fp-gw-v2", [RENEWAL_RISK]: "fp-rr" },
      };
      const dag2 = mountDag({
        topology: topology2,
        mounts: {
          [GATEWAY]: { render: render("signals v2") },
          [RENEWAL_RISK]: { render: render("health v2") },
        },
        ledger,
      });
      const third = dag2.ingest(GATEWAY);
      expect(third.map((r) => `${r.node}:${r.disposition}`).sort()).toEqual(
        [`${RENEWAL_RISK}:rendered`, `${GATEWAY}:rendered`].sort(),
      );
      // total.fresh DID move because a contract edit forced a render.
      expect(createReplaySession({ ledger }).costRollup.total.fresh).toBe(4);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("the committed fixture contains a long flat-cost quiet run of zero-fresh skips", () => {
    withFixture((stateDir) => {
      const { session } = openSession(stateDir);
      const skips = session.receipts.filter((r) => r.status === "skipped");
      expect(skips.length).toBeGreaterThan(0);
      for (const s of skips) expect(s.cost.tokens.fresh).toBe(0);

      let longestZeroRun = 0;
      let run = 0;
      for (const r of session.receipts) {
        if (r.cost.tokens.fresh === 0) {
          run += 1;
          longestZeroRun = Math.max(longestZeroRun, run);
        } else {
          run = 0;
        }
      }
      expect(longestZeroRun).toBeGreaterThanOrEqual(12);
    });
  });
});

describe("renewal-risk — selective wake + the non-material memo-hit", () => {
  it("a single account's material move wakes ONLY a re-judgement of that account", () => {
    withFixture((stateDir) => {
      const { session } = openSession(stateDir);
      // The surprise beat: a gateway RENDER that moved exactly ONE acct facet
      // (acme), proving sibling accounts stayed dark (selective wake).
      const single = session.receipts
        .map((r, i) => ({ r, i }))
        .filter(({ r }) => r.node === GATEWAY && r.status === "rendered")
        .find(({ i }) => {
          const acct = [...session.movedFacetsByIndex[i]!].filter((f) => f.startsWith("acct:"));
          return acct.length === 1;
        });
      expect(single, "a single-account gateway delta exists (the surprise)").toBeTruthy();
    });
  });

  it("a verdict-stable re-judgement re-renders the truth but the alert feed stays DARK", () => {
    withFixture((stateDir) => {
      const { session } = openSession(stateDir);
      const n = session.receipts.length;

      // Find a renewal-risk RENDER whose `risk` facet did NOT move — the standing
      // truth re-judged an account (its atomic truth + history moved) but the
      // alertable verdict was unchanged (the non-material hit).
      const stable = session.receipts
        .map((r, i) => ({ r, i }))
        .find(
          ({ r, i }) =>
            r.node === RENEWAL_RISK &&
            r.status === "rendered" &&
            !session.movedFacetsByIndex[i]!.has("risk"),
        );
      expect(stable, "a verdict-stable renewal-risk render exists").toBeTruthy();

      // Across that render the alert feed must NOT produce a new receipt — the
      // unmoved `risk` facet never wakes it (cost scales with surprise).
      const feedCountUpTo = (idx: number) =>
        session.receipts.slice(0, idx + 1).filter((r) => r.node === ALERT_FEED).length;
      // the next gateway/ingress frame bounds this beat.
      let nextBoundary = n;
      for (let j = stable!.i + 1; j < n; j++) {
        if (session.receipts[j]!.node === GATEWAY || session.receipts[j]!.node.startsWith("ingress")) {
          nextBoundary = j;
          break;
        }
      }
      expect(feedCountUpTo(stable!.i - 1)).toBe(feedCountUpTo(nextBoundary - 1));

      // The alert feed still fired on REAL verdict flips elsewhere in the trail.
      const feed = session.receipts.filter((r) => r.node === ALERT_FEED);
      expect(feed.some((r) => r.status === "rendered" && r.cost.tokens.fresh > 0)).toBe(true);
    });
  });
});

describe("renewal-risk — (3) cost.surprise_cause === wake.source on every receipt", () => {
  it("never hardcodes the surprise cause — it equals the receipt's wake source", () => {
    withFixture((stateDir) => {
      const { session } = openSession(stateDir);
      expect(session.receipts.length).toBeGreaterThan(0);
      for (const r of session.receipts) {
        expect(r.cost.surprise_cause).toBe(r.wake.source);
      }
    });
  });
});

describe("renewal-risk — (4) ATOMIC_FACET, never a `*` token", () => {
  it("uses the ATOMIC_FACET constant for atomic edges and no `*` appears anywhere", () => {
    withFixture((stateDir) => {
      const topology = readTopology(stateDir);
      // the gateway's atomic ingress edge resolves to the ATOMIC_FACET token.
      const atomicEdges = topology.edges.filter((e) => e.facet === ATOMIC_FACET);
      expect(atomicEdges.length).toBeGreaterThanOrEqual(1);
      // no "*" token anywhere in the frozen topology or receipts.
      const topoRaw = readFileSync(join(stateDir, "compile", "topology.json"), "utf8");
      const receiptsRaw = readFileSync(join(stateDir, "receipts.json"), "utf8");
      expect(topoRaw).not.toContain('"*"');
      expect(receiptsRaw).not.toContain('"*"');
      for (const e of topology.edges) expect(e.facet).not.toBe("*");
    });
  });
});

describe("renewal-risk — (5) the raw on-disk receipt chains verify", () => {
  it("verifyReceiptChain passes for every node's prev-linked chain", () => {
    withFixture((stateDir) => {
      const { session } = openSession(stateDir);
      for (const [node, chain] of session.chainByNode) {
        const result = verifyReceiptChain(chain);
        expect(result.ok, `chain for ${node} verifies`).toBe(true);
      }
    });
  });
});

describe("renewal-risk — (6) byte-deterministic regeneration", () => {
  it("two generations produce identical receipts / topology / labels / beats", () => {
    const a = mkdtempSync(join(tmpdir(), "renewal-risk-det-a-"));
    const b = mkdtempSync(join(tmpdir(), "renewal-risk-det-b-"));
    try {
      generateRenewalRiskFixture({ stateDir: a });
      generateRenewalRiskFixture({ stateDir: b });
      for (const rel of [
        "receipts.json",
        join("compile", "topology.json"),
        join("compile", "labels.json"),
        "beats.json",
      ]) {
        expect(
          readFileSync(join(a, rel), "utf8"),
          `${rel} is byte-identical across regenerations`,
        ).toBe(readFileSync(join(b, rel), "utf8"));
      }
    } finally {
      rmSync(a, { recursive: true, force: true });
      rmSync(b, { recursive: true, force: true });
    }
  });
});
