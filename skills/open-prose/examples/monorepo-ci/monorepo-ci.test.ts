// Deterministic tier-2 gate for the monorepo-ci example (offline, zero spend).
//
// It proves THE VALIDITY CONTRACT off the persisted ledger:
//   1. Compiles to the frozen artifact set (topology valid, single entry
//      gateway, acyclic, labels present, flat receipts.json, hex world-models).
//   2. Cold-start renders all nodes; an identical re-wake SKIPS all (a skip
//      propagates nothing, wakes nothing).
//   3. cost.surprise_cause === wake.source on every committed receipt.
//   4. ATOMIC_FACET for facet-less producers; no "*" tokens anywhere.
//   5. verifyReceiptChain passes over the raw on-disk receipts.
//   6. Byte-deterministic: a second regeneration yields identical
//      receipts.json / topology.json / labels.json.
// Plus the example's headline lesson: memoization + hub fan-out blast radius,
// and a failing test driving the merge gate to BLOCKED.
//
// Two drivers, both keyless:
//  - A SMALL in-test mountDag drive (the EVALS.md "drive the reconciler
//    yourself" snippet) proves the cold/quiet/contract-edit cost mechanics on
//    the hub→dependent edge in isolation.
//  - The committed replay/ state-dir (produced by the SHARED generator) proves
//    the full-graph structural claims (leaf dark lanes, hub fan-out, RED→BLOCKED)
//    and chain-verify + byte-determinism.
//
// RUN (offline):
//   cd /Users/sl/code/prose && REACTOR_OFFLINE=1 pnpm test:examples
//     (or scope: REACTOR_OFFLINE=1 npx vitest run skills/open-prose/examples/monorepo-ci)

import { mkdtempSync, rmSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

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
} from "@openprose/reactor/sdk";

import { generate } from "./generate";

const GATEWAY = "gateway.workspace";
const MERGE_GATE = "gate.merge";
const PACKAGES = ["pkg-core", "pkg-ui", "pkg-api", "pkg-utils", "pkg-auth", "pkg-billing"] as const;
const PKG_FACETS = new Set<string>(PACKAGES);

// --- temp-dir helpers -------------------------------------------------------

function withTempDir<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "mci-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function genInto(dir: string) {
  const stateDir = join(dir, "replay");
  const result = generate(stateDir);
  return { stateDir, result };
}

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

// Which non-gateway nodes RENDERED in a receipt window (the lit lane).
function rendersInWindow(
  session: ReturnType<typeof openSession>,
  from: number,
  to: number,
): Set<string> {
  const out = new Set<string>();
  for (let i = from; i <= to && i < session.receipts.length; i++) {
    const r = session.receipts[i]!;
    if (r.status === "rendered" && r.node !== GATEWAY && !r.node.startsWith("ingress.")) {
      out.add(r.node);
    }
  }
  return out;
}

function gatewayMoveOf(session: ReturnType<typeof openSession>, facet: string): number {
  for (let i = 0; i < session.receipts.length; i++) {
    const r = session.receipts[i]!;
    if (r.node !== GATEWAY || r.status !== "rendered") continue;
    const moved = session.movedFacetsByIndex[i]!;
    const movedPkgs = [...moved].filter((f) => PKG_FACETS.has(f));
    if (movedPkgs.length === 1 && movedPkgs[0] === facet) return i;
  }
  return -1;
}

function nextGatewayAfter(session: ReturnType<typeof openSession>, idx: number): number {
  for (let i = idx + 1; i < session.receipts.length; i++) {
    if (session.receipts[i]!.node === GATEWAY) return i;
  }
  return session.receipts.length;
}

// Read every merge-gate version's `merge` disposition from the on-disk
// world-model history (the hex-encoded node dir, OPWM1 blobs under versions/).
function readMergeGateTruth(stateDir: string): string[] {
  const hexNode = Buffer.from(MERGE_GATE, "utf8").toString("hex");
  const versionsDir = join(stateDir, "world-models", hexNode, "versions");
  const out: string[] = [];
  if (!existsSync(versionsDir)) return out;
  for (const entry of readdirSync(versionsDir)) {
    if (!entry.endsWith(".bin")) continue;
    const m = /"merge":"([A-Z]+)"/.exec(readFileSync(join(versionsDir, entry), "utf8"));
    if (m) out.push(m[1]!);
  }
  return out;
}

// ===========================================================================
// 1 + 4. Frozen artifact set: topology valid, single entry gateway, acyclic,
// labels present, flat receipts.json, hex world-models, ATOMIC_FACET / no "*".
// ===========================================================================

describe("monorepo-ci — compiles to the frozen artifact set", () => {
  it("emits topology.json, labels.json, a flat receipts.json, and hex world-models", () => {
    withTempDir((dir) => {
      const { stateDir } = genInto(dir);
      expect(existsSync(join(stateDir, "receipts.json"))).toBe(true);
      expect(existsSync(join(stateDir, "compile", "topology.json"))).toBe(true);
      expect(existsSync(join(stateDir, "compile", "labels.json"))).toBe(true);
      expect(existsSync(join(stateDir, "beats.json"))).toBe(true);
      // flat root ledger, NOT a receipts/ subdir
      expect(existsSync(join(stateDir, "receipts"))).toBe(false);
      // hex-encoded node dirs: gate.merge -> 676174652e6d65726765
      const hexMerge = Buffer.from(MERGE_GATE, "utf8").toString("hex");
      expect(existsSync(join(stateDir, "world-models", hexMerge, "published.json"))).toBe(true);
    });
  });

  it("is a valid TopologyWorldModel: 22 nodes, acyclic, a single entry gateway", () => {
    withTempDir((dir) => {
      const { stateDir } = genInto(dir);
      const topology = readTopology(stateDir);
      expect(topology.nodes.length).toBe(22);
      expect(topology.acyclic).toBe(true);
      expect(topology.entry_points).toEqual([GATEWAY]);
      expect(topology.nodes.filter((n) => n.node.startsWith("build.")).length).toBe(6);
      expect(topology.nodes.filter((n) => n.node.startsWith("test.")).length).toBe(6);
      expect(topology.nodes.filter((n) => n.node.startsWith("lint.")).length).toBe(6);
    });
  });

  it("uses ATOMIC_FACET for facet-less edges and never the '*' token", () => {
    withTempDir((dir) => {
      const { stateDir } = genInto(dir);
      const topology = readTopology(stateDir);
      // No raw "*" facet anywhere in the resolved edges.
      for (const e of topology.edges) {
        expect(e.facet).not.toBe("*");
      }
      // The facet-less fan-ins (test→build, typecheck/review/merge) carry the
      // exported ATOMIC_FACET constant, not a string literal "*".
      const fanIn = topology.edges.filter(
        (e) => e.subscriber === MERGE_GATE && e.producer.startsWith("test."),
      );
      expect(fanIn.length).toBe(6);
      for (const e of fanIn) expect(e.facet).toBe(ATOMIC_FACET);
      // And the raw on-disk topology bytes contain no "*" facet token.
      const raw = readFileSync(join(stateDir, "compile", "topology.json"), "utf8");
      expect(raw).not.toMatch(/"facet"\s*:\s*"\*"/);
    });
  });

  it("wires the hub edge (ui/api/auth ← core-dist) and leaves utils/billing as leaves", () => {
    withTempDir((dir) => {
      const { stateDir } = genInto(dir);
      const topology = readTopology(stateDir);
      for (const pkg of PACKAGES) {
        expect(
          topology.edges.some(
            (e) => e.producer === GATEWAY && e.facet === pkg && e.subscriber === `build.${pkg}`,
          ),
        ).toBe(true);
      }
      for (const dep of ["pkg-ui", "pkg-api", "pkg-auth"]) {
        expect(
          topology.edges.some(
            (e) =>
              e.producer === "build.pkg-core" &&
              e.facet === "core-dist" &&
              e.subscriber === `build.${dep}`,
          ),
        ).toBe(true);
      }
      for (const leaf of ["pkg-utils", "pkg-billing"]) {
        expect(
          topology.edges.some(
            (e) => e.producer === "build.pkg-core" && e.subscriber === `build.${leaf}`,
          ),
        ).toBe(false);
      }
    });
  });
});

// ===========================================================================
// 3 + 5. Every committed receipt has surprise_cause === wake.source; the raw
// on-disk chain verifies.
// ===========================================================================

describe("monorepo-ci — the committed ledger is sound", () => {
  it("cost.surprise_cause === wake.source on EVERY committed receipt", () => {
    withTempDir((dir) => {
      const { stateDir } = genInto(dir);
      const session = openSession(stateDir);
      expect(session.receipts.length).toBeGreaterThan(0);
      for (const r of session.receipts) {
        expect(r.cost.surprise_cause).toBe(r.wake.source);
      }
    });
  });

  it("verifyReceiptChain passes over every node's raw on-disk chain", () => {
    withTempDir((dir) => {
      const { stateDir } = genInto(dir);
      // The flat ledger interleaves every node; verifyReceiptChain validates a
      // single node-scoped `prev`-linked slice, so group by node first (preserving
      // append order) and verify each chain.
      const raw = JSON.parse(readFileSync(join(stateDir, "receipts.json"), "utf8")) as {
        node: string;
      }[];
      const byNode = new Map<string, unknown[]>();
      for (const r of raw) {
        const list = byNode.get(r.node) ?? [];
        list.push(r);
        byNode.set(r.node, list);
      }
      expect(byNode.size).toBeGreaterThan(0);
      for (const [node, chain] of byNode) {
        const result = verifyReceiptChain(chain);
        expect(result.ok, `chain for ${node} verifies`).toBe(true);
      }
    });
  });
});

// ===========================================================================
// 2 + cost rollup. Cold-start renders all; an identical re-wake skips all and
// the fresh meter does NOT move; a contract_fingerprint edit DOES move it.
// (The EVALS.md "drive the reconciler yourself" mechanics, on the hub edge.)
// ===========================================================================

describe("monorepo-ci — memoization: quiet wakes skip, a contract edit renders + propagates", () => {
  // A minimal hub→dependent slice: build.pkg-core exposes core-dist; build.pkg-ui
  // subscribes to it. This isolates the memo-key mechanic the full graph relies on.
  const render = (text: string) => (ctx: RenderContext) => ({
    world_model: files({ "out.txt": textFile(text) }),
    cost: {
      provider: "none",
      model: "fake",
      tokens: { fresh: 1, reused: 0 },
      surprise_cause: ctx.wake.source,
    },
  });

  function topo(coreFp: string): ReconcilerTopology {
    return {
      topology: {
        nodes: [
          { node: "build.pkg-core", contract_fingerprint: coreFp, wake_source: "external" },
          { node: "build.pkg-ui", contract_fingerprint: "fp-ui", wake_source: "input" },
        ],
        edges: [{ subscriber: "build.pkg-ui", producer: "build.pkg-core", facet: ATOMIC_FACET }],
        entry_points: ["build.pkg-core"],
        acyclic: true,
      },
      contract_fingerprints: { "build.pkg-core": coreFp, "build.pkg-ui": "fp-ui" },
    };
  }

  it("cold renders both, an identical re-wake skips (propagating nothing), and a contract edit re-renders", () => {
    withTempDir((dir) => {
      const storage = createFileSystemStorageAdapter({ directory: dir });
      const ledger = createFileSystemReceiptLedger({ storage });

      const dag = mountDag({
        topology: topo("fp-core"),
        mounts: {
          "build.pkg-core": { render: render("core v1") },
          "build.pkg-ui": { render: render("ui on core v1") },
        },
        ledger,
      });

      // Cold-start: BOTH render.
      const first = dag.ingest("build.pkg-core");
      expect(first.map((r) => `${r.node}:${r.disposition}`).sort()).toEqual([
        "build.pkg-core:rendered",
        "build.pkg-ui:rendered",
      ]);

      // Identical re-wake: the hub SKIPS and the dependent is not even woken.
      const second = dag.ingest("build.pkg-core");
      expect(second.map((r) => `${r.node}:${r.disposition}`)).toEqual(["build.pkg-core:skipped"]);
      expect(createReplaySession({ ledger }).costRollup.total.fresh).toBe(2);

      // A contract_fingerprint edit moves the memo key → render + propagate.
      const dag2 = mountDag({
        topology: topo("fp-core-v2"),
        mounts: {
          "build.pkg-core": { render: render("core v2") },
          "build.pkg-ui": { render: render("ui on core v2") },
        },
        ledger,
      });
      const third = dag2.ingest("build.pkg-core");
      expect(third.map((r) => `${r.node}:${r.disposition}`).sort()).toEqual([
        "build.pkg-core:rendered",
        "build.pkg-ui:rendered",
      ]);
      expect(createReplaySession({ ledger }).costRollup.total.fresh).toBe(4);
    });
  });
});

// ===========================================================================
// The full-graph lesson off the committed replay: a quiet re-scan skips the
// whole graph (fresh flat); a leaf diff lights ONE lane; a hub diff fans out;
// a failing test drives the merge gate to BLOCKED.
// ===========================================================================

describe("monorepo-ci — hub fan-out blast radius + failing test → BLOCKED", () => {
  it("a byte-identical re-scan memo-skips the whole graph (a skip burns zero fresh)", () => {
    withTempDir((dir) => {
      const { stateDir } = genInto(dir);
      const session = openSession(stateDir);
      const skips = session.receipts.filter((r) => r.status === "skipped");
      expect(skips.length).toBeGreaterThan(0);
      for (const s of skips) expect(s.cost.tokens.fresh).toBe(0);
    });
  });

  it("a 4-line pkg-ui leaf diff rebuilds ONLY pkg-ui; the other five stay dark", () => {
    withTempDir((dir) => {
      const { stateDir } = genInto(dir);
      const session = openSession(stateDir);
      const topology = readTopology(stateDir);

      const leafIdx = gatewayMoveOf(session, "pkg-ui");
      expect(leafIdx).toBeGreaterThanOrEqual(0);

      // The immediate subscribers via the SDK's own propagation.
      const targets = propagationTargets({
        topology,
        producer: GATEWAY,
        movedFacets: session.movedFacetsByIndex[leafIdx]!,
        wakeRef: session.receipts[leafIdx]!.content_hash,
      }).map((t) => t.node);
      expect(targets.filter((n) => n.startsWith("build.")).sort()).toEqual(["build.pkg-ui"]);
      expect(targets.filter((n) => n.startsWith("lint.")).sort()).toEqual(["lint.pkg-ui"]);

      const rendered = rendersInWindow(session, leafIdx + 1, nextGatewayAfter(session, leafIdx) - 1);
      expect(rendered.has("build.pkg-ui")).toBe(true);
      expect(rendered.has("test.pkg-ui")).toBe(true);
      expect(rendered.has(MERGE_GATE)).toBe(true);
      for (const pkg of PACKAGES) {
        if (pkg === "pkg-ui") continue;
        expect(rendered.has(`build.${pkg}`)).toBe(false);
        expect(rendered.has(`test.${pkg}`)).toBe(false);
      }
      expect([...rendered].filter((n) => n.startsWith("build.")).sort()).toEqual(["build.pkg-ui"]);
    });
  });

  it("a pkg-core hub diff fans out to core+ui+api+auth and wakes strictly more than the leaf", () => {
    withTempDir((dir) => {
      const { stateDir } = genInto(dir);
      const session = openSession(stateDir);

      const leafIdx = gatewayMoveOf(session, "pkg-ui");
      const leafRendered = rendersInWindow(session, leafIdx + 1, nextGatewayAfter(session, leafIdx) - 1);

      const hubIdx = gatewayMoveOf(session, "pkg-core");
      expect(hubIdx).toBeGreaterThanOrEqual(0);
      const hubRendered = rendersInWindow(session, hubIdx + 1, nextGatewayAfter(session, hubIdx) - 1);

      expect([...hubRendered].filter((n) => n.startsWith("build.")).sort()).toEqual([
        "build.pkg-api",
        "build.pkg-auth",
        "build.pkg-core",
        "build.pkg-ui",
      ]);
      for (const leaf of ["pkg-utils", "pkg-billing"]) {
        expect(hubRendered.has(`build.${leaf}`)).toBe(false);
      }
      expect(hubRendered.size).toBeGreaterThan(leafRendered.size);
    });
  });

  it("a failing pkg-api test is a zero-fresh `failed` receipt that drives the merge gate to BLOCKED", () => {
    withTempDir((dir) => {
      const { stateDir } = genInto(dir);
      const session = openSession(stateDir);

      const failed = session.receipts.filter((r) => r.status === "failed");
      expect(failed.length).toBeGreaterThanOrEqual(1);
      expect(failed.some((r) => r.node === "test.pkg-api")).toBe(true);
      for (const f of failed) expect(f.cost.tokens.fresh).toBe(0);

      const mergeTruth = readMergeGateTruth(stateDir);
      expect(mergeTruth).toContain("BLOCKED");
      expect(mergeTruth).toContain("GREEN");
    });
  });
});

// ===========================================================================
// 6. Byte-determinism: two regenerations are byte-identical.
// ===========================================================================

describe("monorepo-ci — byte-deterministic regeneration", () => {
  it("receipts.json / topology.json / labels.json are byte-identical across two generations", () => {
    withTempDir((a) =>
      withTempDir((b) => {
        const { stateDir: sa } = genInto(a);
        const { stateDir: sb } = genInto(b);
        expect(readFileSync(join(sa, "receipts.json"), "utf8")).toBe(
          readFileSync(join(sb, "receipts.json"), "utf8"),
        );
        expect(readFileSync(join(sa, "compile", "topology.json"), "utf8")).toBe(
          readFileSync(join(sb, "compile", "topology.json"), "utf8"),
        );
        expect(readFileSync(join(sa, "compile", "labels.json"), "utf8")).toBe(
          readFileSync(join(sb, "compile", "labels.json"), "utf8"),
        );
        expect(readFileSync(join(sa, "beats.json"), "utf8")).toBe(
          readFileSync(join(sb, "beats.json"), "utf8"),
        );
      }),
    );
  });
});
