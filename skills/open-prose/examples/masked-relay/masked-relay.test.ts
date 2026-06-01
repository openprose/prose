// masked-relay — the tier-2 DETERMINISTIC gate (offline, zero model spend).
//
// This file IS the worked snippet the README/AUTHORING points at, run verbatim:
// it drives the REAL @openprose/reactor reconciler with deterministic fake
// renders (NO key) and asserts the full VALIDITY CONTRACT off the persisted
// ledger — the same shapes reactor-devtools replays.
//
// RUN (offline, green at zero spend):
//   cd /Users/sl/code/prose && REACTOR_OFFLINE=1 pnpm test:examples
//     (or scope: REACTOR_OFFLINE=1 npx vitest run skills/open-prose/examples/masked-relay)
//
// The six clauses of the validity contract, each asserted below:
//   1. Compiles to the frozen artifact set (topology valid, single entry
//      gateway, acyclic; labels.json + flat receipts.json + world-models/<HEX>).
//   2. Cold-start renders all nodes; an identical re-wake SKIPS all (a skip
//      propagates nothing, wakes nothing).
//   3. cost.surprise_cause === wake.source on every committed receipt.
//   4. ATOMIC_FACET for facet-less producers; no "*" tokens anywhere.
//   5. Chain-verifies: verifyReceiptChain passes over the raw on-disk receipts.
//   6. Byte-deterministic: a second regeneration yields identical
//      receipts.json / topology.json / labels.json.

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
  textFile,
  ATOMIC_FACET,
  type ReconcilerTopology,
  type RenderContext,
  type TopologyWorldModel,
  type LedgerReceipt,
} from "@openprose/reactor/sdk";

import { generateMaskedRelayExample } from "./generate";

const exampleDir = fileURLToPath(new URL(".", import.meta.url));
const committedReplay = join(exampleDir, "replay");

// A throwaway state-dir for the regenerate-and-assert flow.
function freshGen() {
  const dir = mkdtempSync(join(tmpdir(), "masked-relay-"));
  const result = generateMaskedRelayExample({ stateDir: dir });
  return { dir, result };
}

// ---------------------------------------------------------------------------
// PART A — the example's committed `replay/` state-dir is valid + replayable.
// ---------------------------------------------------------------------------

describe("masked-relay — frozen artifact set (validity contract §1)", () => {
  let dir: string;
  beforeAll(() => {
    dir = freshGen().dir;
  });
  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("emits the devtools state-dir shape: flat receipts.json, world-models/<HEX>, compile/{topology,labels}.json, beats.json", () => {
    expect(existsSync(join(dir, "receipts.json"))).toBe(true);
    expect(existsSync(join(dir, "world-models"))).toBe(true);
    expect(existsSync(join(dir, "compile", "topology.json"))).toBe(true);
    expect(existsSync(join(dir, "compile", "labels.json"))).toBe(true);
    expect(existsSync(join(dir, "beats.json"))).toBe(true);

    // world-model node dirs are HEX-encoded node ids (finding.B2 -> 66...).
    const wmDirs = readdirSync(join(dir, "world-models"));
    expect(wmDirs.length).toBeGreaterThanOrEqual(12);
    // gateway.signal-inbox -> hex
    const gwHex = Buffer.from("gateway.signal-inbox", "utf8").toString("hex");
    expect(wmDirs).toContain(gwHex);
    // each version is sha256_<H>.bin
    const sample = readdirSync(join(dir, "world-models", gwHex, "versions"));
    expect(sample.every((f) => /^sha256_[0-9a-f]+\.bin$/.test(f))).toBe(true);
  });

  it("topology.json is a valid TopologyWorldModel: 12 nodes, 23 edges, single entry gateway, acyclic", () => {
    const topology = JSON.parse(
      readFileSync(join(dir, "compile", "topology.json"), "utf8"),
    ) as TopologyWorldModel;
    expect(topology.nodes.length).toBe(12);
    expect(topology.edges.length).toBe(23);
    expect(topology.acyclic).toBe(true);
    expect(topology.entry_points).toEqual(["gateway.signal-inbox"]);

    // every edge is a real subscriber/producer/facet triple; producers exist.
    const ids = new Set(topology.nodes.map((n) => n.node));
    for (const e of topology.edges) {
      expect(ids.has(e.subscriber)).toBe(true);
      // ingress.signal-inbox is the phantom external producer (not a node).
      expect(e.producer === "ingress.signal-inbox" || ids.has(e.producer)).toBe(true);
      expect(typeof e.facet).toBe("string");
    }
  });

  it("labels.json names every node (normalized: present for every example)", () => {
    const labels = JSON.parse(
      readFileSync(join(dir, "compile", "labels.json"), "utf8"),
    ) as Record<string, string>;
    const topology = JSON.parse(
      readFileSync(join(dir, "compile", "topology.json"), "utf8"),
    ) as TopologyWorldModel;
    for (const n of topology.nodes) {
      expect(labels[n.node], `label for ${n.node}`).toBeTruthy();
    }
  });

  it("ATOMIC_FACET for facet-less producers; NO \"*\" tokens anywhere (validity contract §4)", () => {
    const topoRaw = readFileSync(join(dir, "compile", "topology.json"), "utf8");
    // No wildcard token leaked into the resolved edges.
    expect(topoRaw).not.toMatch(/"\*"/);
    const topology = JSON.parse(topoRaw) as TopologyWorldModel;
    // facet-less producers expose the atomic facet by its constant, not "*".
    const atomicEdges = topology.edges.filter((e) => e.facet === ATOMIC_FACET);
    expect(atomicEdges.length).toBeGreaterThan(0);
    // and the masked-projection facet lanes are NAMED (view_e1/view_e2), real.
    const facets = new Set(topology.edges.map((e) => e.facet));
    expect(facets.has("view_e1")).toBe(true);
    expect(facets.has("view_e2")).toBe(true);
  });

  it("replays through the SDK read view: cost meter sings, a skip is fresh:0, chain verifies (validity contract §3/§5)", () => {
    const storage = createFileSystemStorageAdapter({ directory: dir });
    const ledger = createFileSystemReceiptLedger({ storage });
    const session = createReplaySession({ ledger });

    expect(session.receipts.length).toBeGreaterThan(0);

    // §3: cost.surprise_cause === wake.source on EVERY committed receipt.
    for (const r of session.receipts) {
      expect(r.cost.surprise_cause, `receipt ${r.node}`).toBe(r.wake.source);
    }

    // the meter sings: fresh spent on renders, reused accumulates on memo hits.
    expect(session.costRollup.total.fresh).toBeGreaterThan(0);
    expect(session.costRollup.total.reused).toBeGreaterThan(0);
    // byCause partitions total exactly across the three buckets.
    const { external, input, self } = session.costRollup.byCause;
    expect(external.fresh + input.fresh + self.fresh).toBe(
      session.costRollup.total.fresh,
    );
    // this relay is purely EXTERNAL-driven: no node ever wakes itself. Pinning
    // self.fresh === 0 makes a future regression that introduces a self-wake
    // (a timer / internal re-derivation) go red here, forcing it to be on purpose.
    expect(self.fresh).toBe(0);
    // and the two live buckets actually carry the cost: external (the gateway on a
    // new signal) and input (every interior fan-out / projection / fan-in node).
    expect(external.fresh).toBeGreaterThan(0);
    expect(input.fresh).toBeGreaterThan(0);

    // a memo-skip exists (the quiet re-wake) and carries zero fresh — flat line.
    const skips = session.receipts.filter((r) => r.status === "skipped");
    expect(skips.length).toBeGreaterThan(0);
    for (const s of skips) expect(s.cost.tokens.fresh).toBe(0);

    // §5: every node's prev-linked chain verifies over the raw on-disk receipts.
    for (const [node, chain] of session.chainByNode) {
      expect(verifyReceiptChain(chain as LedgerReceipt[]).ok, `chain ${node}`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// PART B — the focused mountDag drive: cold renders all, quiet skips all, a
// contract_fingerprint edit forces a render and MOVES total.fresh.
// This is the EVALS-style worked snippet (validity contract §2).
// ---------------------------------------------------------------------------

// A tiny three-node slice of the relay (gateway -> ledger -> scout) with the
// SAME render/cost discipline, driven directly so the dispositions + the
// quiet-skip vs contract-edit-render contrast are asserted in-line.
const render =
  (text: string) =>
  (ctx: RenderContext) => ({
    world_model: files({ "out.txt": textFile(text) }),
    cost: {
      provider: "fixture",
      model: "deterministic-fake",
      tokens: { fresh: 1, reused: 0 },
      // surprise_cause MUST equal the wake source — read off the context, never
      // hardcoded (the commit verifies this invariant).
      surprise_cause: ctx.wake.source,
    },
  });

function topo(sourceFp: string): ReconcilerTopology {
  return {
    topology: {
      nodes: [
        { node: "gateway", contract_fingerprint: sourceFp, wake_source: "external" },
        { node: "ledger", contract_fingerprint: "fp-ledger", wake_source: "input" },
        { node: "scout", contract_fingerprint: "fp-scout", wake_source: "input" },
      ],
      edges: [
        // facet-less producers subscribe via ATOMIC_FACET, never "*".
        { subscriber: "ledger", producer: "gateway", facet: ATOMIC_FACET },
        { subscriber: "scout", producer: "ledger", facet: ATOMIC_FACET },
      ],
      entry_points: ["gateway"],
      acyclic: true,
    },
    contract_fingerprints: { gateway: sourceFp, ledger: "fp-ledger", scout: "fp-scout" },
  };
}

describe("masked-relay — cold renders all, quiet skips all, surprise renders (validity contract §2)", () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "masked-relay-drive-"));
  });
  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("cold-start renders all; identical re-wake skips all; a contract edit renders and moves total.fresh", () => {
    const storage = createFileSystemStorageAdapter({ directory: dir });
    const ledger = createFileSystemReceiptLedger({ storage });

    const dag1 = mountDag({
      topology: topo("fp-gateway-v1"),
      mounts: {
        gateway: { render: render("v1") },
        ledger: { render: render("ledger of v1") },
        scout: { render: render("scout of v1") },
      },
      ledger,
    });

    // 1) cold-start: every node renders.
    const cold = dag1.ingest("gateway");
    const coldByNode = Object.fromEntries(cold.map((r) => [r.node, r.disposition]));
    expect(coldByNode["gateway"]).toBe("rendered");
    expect(coldByNode["ledger"]).toBe("rendered");
    expect(coldByNode["scout"]).toBe("rendered");

    const freshAfterCold = createReplaySession({ ledger }).costRollup.total.fresh;
    expect(freshAfterCold).toBe(3); // three cold renders, fresh:1 each

    // 2) an identical re-wake: nothing moved -> the gateway SKIPS, and a skip
    //    propagates NOTHING, so ledger/scout are never even woken.
    const quiet = dag1.ingest("gateway");
    const quietByNode = Object.fromEntries(quiet.map((r) => [r.node, r.disposition]));
    expect(quietByNode["gateway"]).toBe("skipped");
    // a skip wakes nothing downstream: ledger/scout are absent from the result.
    expect(quiet.some((r) => r.node === "ledger" && r.disposition === "rendered")).toBe(
      false,
    );
    expect(quiet.some((r) => r.node === "scout" && r.disposition === "rendered")).toBe(
      false,
    );

    // the flat-line: a quiet re-wake does NOT move total.fresh.
    const freshAfterQuiet = createReplaySession({ ledger }).costRollup.total.fresh;
    expect(freshAfterQuiet).toBe(freshAfterCold);

    // 3) MOVE the memo key — edit the gateway's contract_fingerprint — and
    //    re-mount over the SAME persisted ledger. The memo MISSES; the gateway
    //    renders and its moved truth propagates down the chain.
    const dag2 = mountDag({
      topology: topo("fp-gateway-v2"),
      mounts: {
        gateway: { render: render("v2") },
        ledger: { render: render("ledger of v2") },
        scout: { render: render("scout of v2") },
      },
      ledger,
    });
    const surprise = dag2.ingest("gateway");
    const surpriseByNode = Object.fromEntries(surprise.map((r) => [r.node, r.disposition]));
    expect(surpriseByNode["gateway"]).toBe("rendered");
    expect(surpriseByNode["ledger"]).toBe("rendered");
    expect(surpriseByNode["scout"]).toBe("rendered");

    // total.fresh DID move (+3) on the contract edit.
    const freshAfterSurprise = createReplaySession({ ledger }).costRollup.total.fresh;
    expect(freshAfterSurprise).toBe(freshAfterCold + 3);

    // surprise_cause === wake.source still holds on every receipt.
    for (const r of createReplaySession({ ledger }).receipts) {
      expect(r.cost.surprise_cause).toBe(r.wake.source);
    }
  });
});

// ---------------------------------------------------------------------------
// PART C — byte-determinism: two regenerations are identical (validity §6) AND
// the committed `replay/` matches a fresh regeneration (drift guard).
// ---------------------------------------------------------------------------

describe("masked-relay — byte-deterministic regeneration (validity contract §6)", () => {
  it("two fresh generations yield identical receipts.json / topology.json / labels.json / beats.json", () => {
    const a = freshGen().dir;
    const b = freshGen().dir;
    try {
      for (const rel of [
        "receipts.json",
        join("compile", "topology.json"),
        join("compile", "labels.json"),
        "beats.json",
      ]) {
        expect(readFileSync(join(a, rel), "utf8"), rel).toBe(
          readFileSync(join(b, rel), "utf8"),
        );
      }
    } finally {
      rmSync(a, { recursive: true, force: true });
      rmSync(b, { recursive: true, force: true });
    }
  });

  it("the COMMITTED replay/ matches a fresh regeneration (no drift)", () => {
    const fresh = freshGen().dir;
    try {
      for (const rel of [
        "receipts.json",
        join("compile", "topology.json"),
        join("compile", "labels.json"),
        "beats.json",
      ]) {
        expect(readFileSync(join(committedReplay, rel), "utf8"), rel).toBe(
          readFileSync(join(fresh, rel), "utf8"),
        );
      }
    } finally {
      rmSync(fresh, { recursive: true, force: true });
    }
  });
});
