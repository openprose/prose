// The surprise-cost OFFLINE GATE: deterministic, offline, zero model spend.
//
// This is the worked, executable form of `packages/reactor/EVALS.md`: it drives
// the REAL `@openprose/reactor` reconciler with deterministic fake renders and
// asserts the whole validity contract off the persisted ledger. Its body mirrors
// the README walkthrough; if this breaks, the README is wrong, so fix both together.
//
// THE VALIDITY CONTRACT this asserts:
//   1. Compiles to the frozen artifact set (topology valid, single entry
//      gateway, acyclic; labels + flat receipts.json + hex world-models present).
//   2. Cold-start renders all nodes; an identical re-wake SKIPS all; a skip
//      propagates nothing and wakes nothing.
//   3. cost.surprise_cause === wake.source on every receipt.
//   4. ATOMIC_FACET for the facet-less producers; no "*" tokens anywhere.
//   5. Chain-verifies: verifyReceiptChain passes over the raw on-disk receipts.
//   6. Byte-deterministic: a second regeneration is identical.
//
// Plus the marquee in-process drive (the EVALS.md snippet, verbatim shape):
// a hand-mounted gateway→digest over a temp ledger; quiet re-wake keeps
// total.fresh flat; a contract_fingerprint edit moves it.

import { strict as assert } from "node:assert";
import { describe, it } from "vitest";
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  existsSync,
  readdirSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

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
} from "@openprose/reactor";
import { FileSystemReceiptLedger } from "@openprose/reactor/adapters";
import type {
  ReconcilerTopology,
  TopologyWorldModel,
} from "@openprose/reactor/internals";

import { generateSurpriseCostFixture } from "./generate";

const GATEWAY = "gateway.signals";
const DIGEST = "responsibility.digest";

function tmp(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

// Recursively list every file under a directory (depth-first, no dirs).
function walk(root: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(root)) {
    const full = join(root, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

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

// ===========================================================================
// (1) THE EVALS.md SNIPPET, run verbatim in-process: the marquee skipped/fresh=0
//     frame + the surprise-render-on-contract-move. This is the README body.
// ===========================================================================
describe("surprise-cost — the EVALS walkthrough (quiet skip → surprise render)", () => {
  it("a quiet re-wake skips (fresh flat); a contract edit renders + propagates", () => {
    const dir = tmp("surprise-cost-evals-");
    try {
      const storage = createFileSystemStorageAdapter({ directory: dir });
      const ledger = createFileSystemReceiptLedger({ storage });

      // Deterministic fake render. THE INVARIANT: cost.surprise_cause is read off
      // ctx.wake.source — never hardcoded (the reconciler verifies it on commit).
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
            {
              node: GATEWAY,
              contract_fingerprint: "fp-gateway",
              wake_source: "external",
            },
            {
              node: DIGEST,
              contract_fingerprint: "fp-digest",
              wake_source: "input",
            },
          ],
          // facet-less producer → ATOMIC_FACET, never "*".
          edges: [
            { subscriber: DIGEST, producer: GATEWAY, facet: ATOMIC_FACET },
          ],
          entry_points: [GATEWAY],
          acyclic: true,
        },
        contract_fingerprints: {
          [GATEWAY]: "fp-gateway",
          [DIGEST]: "fp-digest",
        },
      };
      const dag = mountDag({
        topology,
        mounts: {
          [GATEWAY]: { render: render("v1") },
          [DIGEST]: { render: render("digest of v1") },
        },
        ledger,
      });

      // epoch1 — COLD: both render.
      const cold = dag.ingest(GATEWAY);
      assert.deepEqual(
        cold.map((r) => `${r.node}:${r.disposition}`).sort(),
        [`${GATEWAY}:rendered`, `${DIGEST}:rendered`].sort(),
        "cold-start renders both nodes",
      );

      // epoch2 — QUIET: nothing moved → the gateway skips, the digest is not woken.
      const quiet = dag.ingest(GATEWAY);
      assert.deepEqual(
        quiet.map((r) => `${r.node}:${r.disposition}`),
        [`${GATEWAY}:skipped`],
        "an identical re-wake skips the gateway; a skip propagates nothing",
      );
      assert.equal(
        createReplaySession({ ledger }).costRollup.total.fresh,
        2,
        "the skip cost 0 fresh — total stays at the two cold renders",
      );

      // epoch3 — SURPRISE: move the memo key (bump the gateway contract_fp) over
      // the SAME ledger → the memo MISSES, the gateway renders, the digest wakes.
      const topology2: ReconcilerTopology = {
        topology: {
          nodes: [
            {
              node: GATEWAY,
              contract_fingerprint: "fp-gateway-v2",
              wake_source: "external",
            },
            {
              node: DIGEST,
              contract_fingerprint: "fp-digest",
              wake_source: "input",
            },
          ],
          edges: [
            { subscriber: DIGEST, producer: GATEWAY, facet: ATOMIC_FACET },
          ],
          entry_points: [GATEWAY],
          acyclic: true,
        },
        contract_fingerprints: {
          [GATEWAY]: "fp-gateway-v2",
          [DIGEST]: "fp-digest",
        },
      };
      const dag2 = mountDag({
        topology: topology2,
        mounts: {
          [GATEWAY]: { render: render("v2") },
          [DIGEST]: { render: render("digest of v2") },
        },
        ledger,
      });
      const surprise = dag2.ingest(GATEWAY);
      assert.deepEqual(
        surprise.map((r) => `${r.node}:${r.disposition}`).sort(),
        [`${GATEWAY}:rendered`, `${DIGEST}:rendered`].sort(),
        "a moved contract_fingerprint renders the gateway and wakes the digest",
      );
      assert.equal(
        createReplaySession({ ledger }).costRollup.total.fresh,
        4,
        "two more renders → fresh moves 2 → 4 (cost scales with surprise)",
      );

      // cost.surprise_cause === wake.source on EVERY receipt.
      for (const r of createReplaySession({ ledger }).receipts) {
        assert.equal(
          r.cost.surprise_cause,
          r.wake.source,
          `surprise_cause must equal the wake source on ${r.node}`,
        );
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ===========================================================================
// (2) THE FULL FIXTURE: the generator drives the real reconciler and emits the
//     replay/ state-dir into a tmpdir. Assert the validity contract off it.
// ===========================================================================
describe("surprise-cost — the generated replay fixture (validity contract)", () => {
  it("(1) compiles to the frozen artifact set: single entry gateway, acyclic, labels + hex world-models", () => {
    const dir = tmp("surprise-cost-shape-");
    try {
      const result = generateSurpriseCostFixture({ stateDir: dir });

      assert.ok(
        existsSync(join(dir, "receipts.json")),
        "flat root receipts.json present",
      );
      // The storage adapter intentionally initializes a runtime-registry snapshot
      // alongside the ledger; with no live runtime mounted it is the empty `{}`.
      // It is a real, reproduced artifact (not an orphan) — assert it explicitly so
      // the full-tree byte-determinism check (#6) has a documented anchor.
      assert.ok(
        existsSync(join(dir, "registry.json")),
        "runtime-registry snapshot present",
      );
      assert.deepEqual(
        JSON.parse(readFileSync(join(dir, "registry.json"), "utf8")),
        {},
        "the registry is the empty snapshot (no live runtime is mounted)",
      );
      assert.ok(
        existsSync(join(dir, "compile", "topology.json")),
        "topology snapshot present",
      );
      assert.ok(
        existsSync(join(dir, "compile", "labels.json")),
        "labels map present",
      );
      assert.ok(existsSync(join(dir, "beats.json")), "beats map present");
      assert.ok(
        existsSync(join(dir, "world-models")),
        "world-models dir present",
      );

      const topology = readTopology(dir);
      assert.equal(
        topology.nodes.length,
        2,
        "two real nodes (gateway → digest)",
      );
      assert.equal(topology.acyclic, true, "the graph is acyclic");
      assert.deepEqual(
        topology.entry_points,
        [GATEWAY],
        "single entry gateway",
      );
      assert.equal(topology.edges.length, 1, "one edge");
      assert.deepEqual(
        topology.edges[0],
        { subscriber: DIGEST, producer: GATEWAY, facet: ATOMIC_FACET },
        "the edge is digest→gateway on the ATOMIC_FACET",
      );

      // hex-encoded world-model dirs (e.g. gateway.signals → 67617465...).
      const wmDirs = readdirSync(join(dir, "world-models"));
      for (const node of [GATEWAY, DIGEST]) {
        const hex = Buffer.from(node, "utf8").toString("hex");
        assert.ok(
          wmDirs.includes(hex),
          `world-model dir for ${node} is hex-encoded (${hex})`,
        );
        assert.ok(
          existsSync(join(dir, "world-models", hex, "published.json")),
          `${node} has a published.json`,
        );
        const versions = readdirSync(
          join(dir, "world-models", hex, "versions"),
        );
        assert.ok(
          versions.some((f) => f.startsWith("sha256_") && f.endsWith(".bin")),
          `${node} has a sha256_*.bin version blob`,
        );
      }

      assert.equal(result.receiptsCount, openSession(dir).receipts.length);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("(2) cold-start renders all; the quiet epoch skips; the surprise renders + propagates", () => {
    const dir = tmp("surprise-cost-arc-");
    try {
      generateSurpriseCostFixture({ stateDir: dir });
      const session = openSession(dir);
      const r = session.receipts;

      // The trail is exactly: cold(gateway rendered, digest rendered),
      // quiet(gateway skipped), surprise(gateway rendered, digest rendered).
      const line = r.map((x) => `${x.node}:${x.status}`);
      assert.deepEqual(
        line,
        [
          `${GATEWAY}:rendered`,
          `${DIGEST}:rendered`,
          `${GATEWAY}:skipped`,
          `${GATEWAY}:rendered`,
          `${DIGEST}:rendered`,
        ],
        "cold(2 renders) → quiet(1 skip, no propagation) → surprise(2 renders)",
      );

      // The skip carries zero fresh and propagated nothing (only ONE receipt in
      // the quiet epoch — the digest was never woken).
      const skips = r.filter((x) => x.status === "skipped");
      assert.equal(skips.length, 1, "exactly one memo-skip (the quiet epoch)");
      assert.equal(
        skips[0]!.node,
        GATEWAY,
        "the gateway is the node that skipped",
      );
      assert.equal(skips[0]!.cost.tokens.fresh, 0, "the skip burns zero fresh");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("(2b) the cost rollup: quiet keeps total.fresh flat; the surprise moves it", () => {
    const dir = tmp("surprise-cost-rollup-");
    try {
      generateSurpriseCostFixture({ stateDir: dir });
      const session = openSession(dir);

      // byCause partitions total exactly.
      const { byCause, total } = session.costRollup;
      const buckets = Object.values(byCause);
      assert.equal(
        buckets.reduce((s, b) => s + b.fresh, 0),
        total.fresh,
        "byCause.fresh sums to total.fresh",
      );
      assert.equal(
        buckets.reduce((s, b) => s + b.receipts, 0),
        total.receipts,
        "byCause.receipts sums to total.receipts",
      );

      // Only the three rendered receipts carry fresh; the skip carries none.
      const rendered = session.receipts.filter((x) => x.status === "rendered");
      assert.equal(
        rendered.length,
        4,
        "four rendered receipts (2 cold + 2 surprise)",
      );
      const totalFresh = session.receipts.reduce(
        (s, x) => s + x.cost.tokens.fresh,
        0,
      );
      assert.equal(
        total.fresh,
        totalFresh,
        "the rollup's total.fresh matches the trail",
      );
      assert.ok(total.fresh > 0, "the surprise drove real fresh spend");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("(3) cost.surprise_cause === wake.source on every receipt", () => {
    const dir = tmp("surprise-cost-cause-");
    try {
      generateSurpriseCostFixture({ stateDir: dir });
      for (const r of openSession(dir).receipts) {
        assert.equal(
          r.cost.surprise_cause,
          r.wake.source,
          `surprise_cause must equal the wake source on ${r.node} (${r.status})`,
        );
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('(4) ATOMIC_FACET everywhere — no "*" wildcard tokens in topology or receipts', () => {
    const dir = tmp("surprise-cost-facet-");
    try {
      generateSurpriseCostFixture({ stateDir: dir });
      const topoRaw = readFileSync(
        join(dir, "compile", "topology.json"),
        "utf8",
      );
      const receiptsRaw = readFileSync(join(dir, "receipts.json"), "utf8");

      assert.ok(!/"\*"/.test(topoRaw), 'no "*" token in topology.json');
      assert.ok(!/"\*"/.test(receiptsRaw), 'no "*" token in receipts.json');

      const topology = readTopology(dir);
      assert.ok(
        topology.edges.every((e) => e.facet === ATOMIC_FACET),
        "every edge uses the exported ATOMIC_FACET constant",
      );
      // every rendered receipt exposes the atomic facet (the facet-less producer).
      for (const r of openSession(dir).receipts) {
        if (r.status !== "rendered") continue;
        assert.ok(
          Object.keys(r.fingerprints).includes(ATOMIC_FACET),
          `${r.node} exposes ATOMIC_FACET in its fingerprints`,
        );
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("(5) chain-verifies: verifyReceiptChain passes over the raw on-disk receipts", () => {
    const dir = tmp("surprise-cost-chain-");
    try {
      generateSurpriseCostFixture({ stateDir: dir });
      // verifyReceiptChain takes a NODE-SCOPED prev-linked slice (all the same
      // node, chain[0].prev === null), so verify each node's slice off the raw
      // on-disk trail — catching any tampered field byte-for-byte.
      const raw = JSON.parse(
        readFileSync(join(dir, "receipts.json"), "utf8"),
      ) as {
        node: string;
      }[];
      for (const node of [GATEWAY, DIGEST]) {
        const slice = raw.filter((r) => r.node === node);
        assert.ok(slice.length > 0, `${node} has on-disk receipts`);
        const result = verifyReceiptChain(slice);
        assert.equal(
          result.ok,
          true,
          `${node}'s on-disk receipt chain verifies`,
        );
      }

      // also per-node via the replay read view (the same view devtools renders).
      const session = openSession(dir);
      for (const node of [GATEWAY, DIGEST]) {
        assert.equal(
          session.verifyNodeChain(node).ok,
          true,
          `${node}'s chain verifies`,
        );
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("(6) byte-deterministic: a second regeneration reproduces the ENTIRE replay/ tree, blobs included, with no orphan drift", () => {
    const a = tmp("surprise-cost-det-a-");
    const b = tmp("surprise-cost-det-b-");
    try {
      generateSurpriseCostFixture({ stateDir: a });
      generateSurpriseCostFixture({ stateDir: b });

      // Walk the whole state-dir so byte-determinism covers every emitted file —
      // not just the JSON snapshots but the hex world-models/ tree and its
      // sha256_*.bin blobs. Comparing the relative file SETS also fails loudly on
      // orphan/blob drift (e.g. a stray registry.json one regen omits).
      const tree = (root: string): string[] =>
        walk(root)
          .map((p) => relative(root, p))
          .sort();

      const aFiles = tree(a);
      const bFiles = tree(b);
      assert.deepEqual(
        aFiles,
        bFiles,
        "both regenerations emit the EXACT same file set (no orphan-file drift)",
      );

      for (const rel of aFiles) {
        const ba = readFileSync(join(a, rel));
        const bb = readFileSync(join(b, rel));
        assert.ok(
          ba.equals(bb),
          `${rel} is byte-identical across regenerations`,
        );
      }
    } finally {
      rmSync(a, { recursive: true, force: true });
      rmSync(b, { recursive: true, force: true });
    }
  });
});
