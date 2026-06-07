// The deterministic offline gate for the research-tree example (ZERO
// model spend). It drives the REAL @openprose/reactor reconciler through the
// public exports — exactly the snippet the README/AUTHORING flow describes — and
// asserts the SIX validity-contract invariants off the persisted ledger:
//
//   1. Compiles to the frozen artifact set (topology valid, single entry
//      gateway, acyclic, labels present, world-models per hex node id).
//   2. Cold-start renders all; an identical re-wake SKIPS all (a skip
//      propagates nothing, wakes nothing).
//   3. cost.surprise_cause === wake.source on every committed receipt.
//   4. ATOMIC_FACET for facet-less producers; no "*" tokens anywhere.
//   5. Chain-verifies: verifyReceiptChain passes over the raw on-disk receipts.
//   6. Byte-deterministic: a second regeneration is byte-identical.
//
// THE TENET: propagation UP a recursive tree with PER-BRANCH memoization. Revise
// one leaf finding three levels down and ONLY its ancestor path (finding ->
// sub-synthesis -> root) re-renders — bounded by tree DEPTH, never tree SIZE.
//
// If this test breaks, the example README/AUTHORING snippet is wrong — fix both.

import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  createFileSystemStorageAdapter,
  type ReconcileResult,
} from "@openprose/reactor";
import {
  FileSystemWorldModelStore,
  fingerprintArtifact,
} from "@openprose/reactor/adapters";
import {
  mountDag,
  createFileSystemReceiptLedger,
  createReplaySession,
  files,
  jsonFile,
  ATOMIC_FACET,
  verifyReceiptChain,
  type RenderContext,
  type RenderProduct,
} from "@openprose/reactor";
import {
  readTextFile,
  type WorldModelFiles,
} from "@openprose/reactor/adapters";
import {
  propagationTargets,
  zeroCost,
  createNullSignature,
  EMPTY_SEMANTIC_DIFF,
  type ReconcilerTopology,
  type Facet,
  type Fingerprint,
  type TopologyWorldModel,
} from "@openprose/reactor/internals";

import { generateResearchTree } from "./generate";

const GATEWAY = "gateway.sources";
const ROOT = "synthesis.root";
const FINDING_PREFIX = "finding.";
const SUBSYNTH_PREFIX = "synthesis.sub-";

const SUB_OF_LEAF: Record<string, string> = {
  A1: "A",
  A2: "A",
  A3: "A",
  B1: "B",
  B2: "B",
  B3: "B",
  C1: "C",
  C2: "C",
};
const ALL_LEAVES = Object.keys(SUB_OF_LEAF);

function withTmp<T>(prefix: string, fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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

// ===========================================================================
// THE WORKED SNIPPET (mirrors the README) — a recursive-tree micro-model run
// verbatim against the public SDK. A 2-level tree: a gateway exposing ONE FACET
// PER LEAF, two leaf findings under one sub-synthesis. Revising one leaf's slice
// renders ONLY its ancestor path; the sibling leaf stays dark. A quiet re-wake
// skips the whole tree at zero fresh; a contract edit forces a render.
// ===========================================================================

describe("research-tree — the worked snippet: propagation UP a tree with per-branch memo", () => {
  it("a single-leaf delta renders only its ancestor path; a quiet re-wake skips all; a contract edit renders", () => {
    withTmp("rt-snippet-", (dir) => {
      const storage = createFileSystemStorageAdapter({ directory: dir });
      const ledger = createFileSystemReceiptLedger({ storage });
      const store = new FileSystemWorldModelStore({
        directory: join(dir, "world-models"),
      });

      const SOURCE = "ingress.corpus";
      const L1 = `${FINDING_PREFIX}L1`;
      const L2 = `${FINDING_PREFIX}L2`;

      // The mutable corpus the gateway projects into per-leaf facets.
      let corpus: Record<string, { rev: number; claim: string }> = {
        L1: { rev: 1, claim: "left finding" },
        L2: { rev: 1, claim: "right finding" },
      };
      const fpOf = (v: unknown): Fingerprint =>
        `sha256:${Buffer.from(JSON.stringify(v)).toString("hex")}`;

      // A facet-less producer exposes its truth as ATOMIC_FACET — NEVER "*".
      const atomic = (fm: WorldModelFiles) => ({
        [ATOMIC_FACET]: fingerprintArtifact(fm),
      });
      // The ingress + gateway re-project EACH leaf into an INDEPENDENT facet token
      // (the dark-lane boundary): revising one leaf moves only that token.
      const perLeafCanon = (key: string) => (fm: WorldModelFiles) => {
        const t = JSON.parse(readTextFile(fm[`${key}.json`]!)) as Record<
          string,
          unknown
        >;
        const leaves = (t["leaves"] ?? t) as Record<string, unknown>;
        const out: Record<string, Fingerprint> = {
          [ATOMIC_FACET]: fingerprintArtifact(fm),
        };
        for (const leaf of ["L1", "L2"])
          out[`leaf:${leaf}`] = fpOf(leaves[leaf] ?? null);
        return out;
      };

      // surprise_cause MUST equal the wake source — read it off ctx, never hardcode.
      const render =
        (build: (ctx: RenderContext) => unknown) =>
        (ctx: RenderContext): RenderProduct => ({
          world_model: files({ "truth.json": jsonFile(build(ctx)) }),
          cost: {
            provider: "fixture",
            model: "fake",
            tokens: { fresh: 1, reused: 0 },
            surprise_cause: ctx.wake.source,
          },
        });
      const readJson = (node: string, path = "truth.json") => {
        const read = store.read(node, "published");
        if (read.ref.version === null) return null;
        const b = read.files[path];
        return b === undefined
          ? null
          : (JSON.parse(readTextFile(b)) as Record<string, unknown>);
      };

      const topology = (gwFp: Fingerprint): ReconcilerTopology => ({
        topology: {
          nodes: [
            {
              node: GATEWAY,
              contract_fingerprint: gwFp,
              wake_source: "external",
            },
            { node: L1, contract_fingerprint: "fp-L1", wake_source: "input" },
            { node: L2, contract_fingerprint: "fp-L2", wake_source: "input" },
            {
              node: ROOT,
              contract_fingerprint: "fp-root",
              wake_source: "input",
            },
          ],
          // Per-leaf facet edges (the dark-lane boundary) fan UP to the root.
          edges: [
            { subscriber: GATEWAY, producer: SOURCE, facet: ATOMIC_FACET },
            { subscriber: L1, producer: GATEWAY, facet: "leaf:L1" },
            { subscriber: L2, producer: GATEWAY, facet: "leaf:L2" },
            { subscriber: ROOT, producer: L1, facet: ATOMIC_FACET },
            { subscriber: ROOT, producer: L2, facet: ATOMIC_FACET },
          ],
          entry_points: [GATEWAY],
          acyclic: true,
        },
        contract_fingerprints: {
          [GATEWAY]: gwFp,
          [L1]: "fp-L1",
          [L2]: "fp-L2",
          [ROOT]: "fp-root",
        },
      });

      const mounts = {
        [GATEWAY]: {
          render: render(() => ({
            leaves: readJson(SOURCE, "corpus.json")?.["leaves"] ?? {},
          })),
          canonicalizer: perLeafCanon("truth"),
        },
        [L1]: {
          render: render(() => ({
            leaf: "L1",
            at: fpOf(readJson(GATEWAY)?.["leaves"]),
          })),
          canonicalizer: atomic,
        },
        [L2]: {
          render: render(() => ({
            leaf: "L2",
            at: fpOf(readJson(GATEWAY)?.["leaves"]),
          })),
          canonicalizer: atomic,
        },
        [ROOT]: {
          render: render(() => ({ root: true })),
          canonicalizer: atomic,
        },
      };

      // Publish the raw corpus as the ingress source's truth, then wake the
      // gateway — exactly how generate.ts drives the real episode.
      const publishAndWake = (dag: ReturnType<typeof mountDag>) => {
        const fm = files({ "corpus.json": jsonFile({ leaves: corpus }) });
        const commitRes = store.commitPublished(
          SOURCE,
          fm,
          perLeafCanon("corpus"),
        );
        const prev = ledger.lastReceipt(SOURCE);
        ledger.append({
          node: SOURCE,
          contract_fingerprint: `contract:${SOURCE}`,
          wake: { source: "external", refs: [] },
          input_fingerprints: [],
          fingerprints: commitRes.fingerprints,
          semantic_diff: EMPTY_SEMANTIC_DIFF,
          prev: prev !== null ? ledger.addressOf(prev) : null,
          status: "rendered",
          cost: zeroCost("external"),
          sig: createNullSignature(),
        });
        return dag.ingest(GATEWAY);
      };

      const dag = mountDag({
        topology: topology("fp-gateway-v1"),
        mounts,
        store,
        ledger,
      });

      // Cold start: every node renders bottom-up (the root is a fan-in, so a
      // second convergent wake on it coalesces to a skip — assert each node
      // RENDERED at least once).
      const cold = publishAndWake(dag);
      const renderedIn = (rs: ReconcileResult[]) =>
        new Set(
          rs.filter((r) => r.disposition === "rendered").map((r) => r.node),
        );
      const coldRendered = renderedIn(cold);
      for (const n of [GATEWAY, L1, L2, ROOT]) {
        expect(coldRendered.has(n), `${n} rendered on cold start`).toBe(true);
      }
      const freshAfterCold = createReplaySession({ ledger }).costRollup.total
        .fresh;

      // Quiet re-wake: nothing moved -> the gateway SKIPS and propagates nothing.
      const quiet = publishAndWake(dag);
      expect(quiet.map((r) => `${r.node}:${r.disposition}`)).toEqual([
        `${GATEWAY}:skipped`,
      ]);
      expect(createReplaySession({ ledger }).costRollup.total.fresh).toBe(
        freshAfterCold,
      );

      // Revise ONE leaf (L1). Only `leaf:L1` moves -> only Finding L1 wakes; the
      // root re-synthesizes; Finding L2 stays DARK.
      corpus = { ...corpus, L1: { rev: 2, claim: "left finding revised" } };
      const oneLeaf = publishAndWake(dag);
      const rendered = new Set(
        oneLeaf.filter((r) => r.disposition === "rendered").map((r) => r.node),
      );
      expect(rendered.has(L1)).toBe(true);
      expect(rendered.has(ROOT)).toBe(true);
      expect(oneLeaf.some((r) => r.node === L2)).toBe(false); // sibling never woken

      // A contract_fingerprint edit on the gateway forces a render even with an
      // unchanged corpus (the memo MISS) — fresh moves again.
      const beforeEdit = createReplaySession({ ledger }).costRollup.total.fresh;
      const dag2 = mountDag({
        topology: topology("fp-gateway-v2"),
        mounts,
        store,
        ledger,
      });
      const edited = publishAndWake(dag2);
      expect(
        edited.some((r) => r.node === GATEWAY && r.disposition === "rendered"),
      ).toBe(true);
      expect(
        createReplaySession({ ledger }).costRollup.total.fresh,
      ).toBeGreaterThan(beforeEdit);

      // Every committed receipt honors the surprise-cost invariant + the cost
      // rollup partitions by cause exactly.
      const session = createReplaySession({ ledger });
      for (const r of session.receipts) {
        if (r.status === "rendered") {
          expect(r.cost.surprise_cause).toBe(r.wake.source);
        }
      }
      const byCause = session.costRollup.byCause;
      const summed = Object.values(byCause).reduce(
        (acc, b) => ({
          fresh: acc.fresh + b.fresh,
          reused: acc.reused + b.reused,
        }),
        { fresh: 0, reused: 0 },
      );
      expect(summed.fresh).toBe(session.costRollup.total.fresh);
      expect(summed.reused).toBe(session.costRollup.total.reused);
    });
  });
});

// ===========================================================================
// THE FROZEN FIXTURE — the committed replay/ state-dir the example ships and
// devtools replays unchanged. Generated into a fresh temp dir for each test.
// ===========================================================================

describe("research-tree — the frozen replay/ fixture (the full episode)", () => {
  it("(1) compiles to the frozen artifact set: valid topology, single gateway, acyclic, labels + world-models present", () => {
    withTmp("rt-compile-", (dir) => {
      const result = generateResearchTree({ stateDir: dir });

      expect(existsSync(join(dir, "receipts.json"))).toBe(true); // flat ROOT ledger
      expect(existsSync(join(dir, "world-models"))).toBe(true);
      expect(existsSync(join(dir, "compile", "topology.json"))).toBe(true);
      expect(existsSync(join(dir, "compile", "labels.json"))).toBe(true);
      expect(existsSync(join(dir, "beats.json"))).toBe(true);

      // world-models use the HEX-encoded node id (finding.B2 -> 66696e64696e672e4232).
      const hexB2 = Buffer.from("finding.B2", "utf8").toString("hex");
      expect(
        existsSync(join(dir, "world-models", hexB2, "published.json")),
      ).toBe(true);

      const topology = readTopology(dir);
      expect(topology.acyclic).toBe(true);
      expect(topology.entry_points).toEqual([GATEWAY]); // SINGLE entry gateway
      expect(topology.nodes.length).toBe(13); // gateway + 8 findings + 3 sub-synth + root
      expect(
        topology.nodes.filter((n) => n.node.startsWith(FINDING_PREFIX)).length,
      ).toBe(8);
      expect(
        topology.nodes.filter((n) => n.node.startsWith(SUBSYNTH_PREFIX)).length,
      ).toBe(3);

      // labels cover every node.
      const labels = JSON.parse(
        readFileSync(join(dir, "compile", "labels.json"), "utf8"),
      ) as Record<string, string>;
      for (const n of topology.nodes) expect(labels[n.node]).toBeTruthy();

      // PROPAGATION FLOWS UP: leaf -> sub-synthesis -> root.
      for (const leaf of ALL_LEAVES) {
        const sub = SUB_OF_LEAF[leaf]!;
        expect(
          topology.edges.some(
            (e) =>
              e.producer === GATEWAY &&
              e.facet === `leaf:${leaf}` &&
              e.subscriber === `${FINDING_PREFIX}${leaf}`,
          ),
        ).toBe(true);
        expect(
          topology.edges.some(
            (e) =>
              e.producer === `${FINDING_PREFIX}${leaf}` &&
              e.subscriber === `${SUBSYNTH_PREFIX}${sub}`,
          ),
        ).toBe(true);
      }
      for (const sub of ["A", "B", "C"]) {
        expect(
          topology.edges.some(
            (e) =>
              e.producer === `${SUBSYNTH_PREFIX}${sub}` &&
              e.subscriber === ROOT,
          ),
        ).toBe(true);
      }
    });
  });

  it("(2) cold-start renders all; quiet re-scans skip the whole tree (a skip propagates nothing)", () => {
    withTmp("rt-skip-", (dir) => {
      generateResearchTree({ stateDir: dir });
      const session = openSession(dir);
      const skips = session.receipts.filter((r) => r.status === "skipped");
      expect(skips.length).toBeGreaterThan(0);
      for (const s of skips) {
        expect(s.cost.tokens.fresh).toBe(0); // a skip burns zero fresh + propagates nothing
      }
      // the cold boot rendered every real node at least once.
      const topology = readTopology(dir);
      const renderedNodes = new Set(
        session.receipts
          .filter((r) => r.status === "rendered")
          .map((r) => r.node),
      );
      for (const n of topology.nodes)
        expect(renderedNodes.has(n.node)).toBe(true);
    });
  });

  it("(3) cost.surprise_cause === wake.source on EVERY committed receipt", () => {
    withTmp("rt-cause-", (dir) => {
      generateResearchTree({ stateDir: dir });
      const session = openSession(dir);
      for (const r of session.receipts) {
        expect(r.cost.surprise_cause).toBe(r.wake.source);
      }
      // and a `self` receipt exists (the audit floor), causing zero fresh.
      const selfReceipts = session.receipts.filter(
        (r) => r.wake.source === "self",
      );
      expect(selfReceipts.length).toBeGreaterThanOrEqual(1);
      for (const s of selfReceipts) expect(s.cost.tokens.fresh).toBe(0);
    });
  });

  it('(4) ATOMIC_FACET for facet-less producers; NO "*" tokens anywhere', () => {
    withTmp("rt-atomic-", (dir) => {
      generateResearchTree({ stateDir: dir });
      const topology = readTopology(dir);
      // every facet on every edge is either a real `leaf:<id>` or the atomic facet.
      for (const e of topology.edges) {
        expect(e.facet).not.toBe("*");
        expect(e.facet === ATOMIC_FACET || /^leaf:/.test(e.facet)).toBe(true);
      }
      // the raw bytes carry no "*" facet token.
      const raw = readFileSync(join(dir, "compile", "topology.json"), "utf8");
      expect(raw).not.toContain('"facet": "*"');
      expect(raw).not.toContain('"*"');
      const receiptsRaw = readFileSync(join(dir, "receipts.json"), "utf8");
      expect(receiptsRaw).not.toContain('"*"');
    });
  });

  it("(5) chain-verifies: verifyReceiptChain passes over the raw on-disk per-node chains", () => {
    withTmp("rt-chain-", (dir) => {
      generateResearchTree({ stateDir: dir });
      const session = openSession(dir);
      // Walk each node's prev-linked chain from the RAW ledger and verify it.
      let chainsChecked = 0;
      for (const [node, chain] of session.chainByNode) {
        const result = verifyReceiptChain(chain as readonly unknown[]);
        expect(result.ok, `chain for ${node} verifies`).toBe(true);
        chainsChecked += 1;
      }
      expect(chainsChecked).toBeGreaterThan(0);
    });
  });

  it("(6) byte-deterministic: regenerating into a second temp dir is byte-identical", () => {
    withTmp("rt-det-a-", (a) => {
      withTmp("rt-det-b-", (b) => {
        generateResearchTree({ stateDir: a });
        generateResearchTree({ stateDir: b });
        for (const rel of [
          ["receipts.json"],
          ["compile", "topology.json"],
          ["compile", "labels.json"],
          ["beats.json"],
        ]) {
          expect(
            readFileSync(join(a, ...rel), "utf8"),
            `${rel.join("/")} is byte-identical across regenerations`,
          ).toBe(readFileSync(join(b, ...rel), "utf8"));
        }
      });
    });
  });
});

// ===========================================================================
// THE TENET, ASSERTED — partial propagation UP a tree, bounded by DEPTH.
// ===========================================================================

describe("research-tree — THE TENET: propagation UP a recursive tree with per-branch memo", () => {
  it("revising one leaf wakes ONLY its finding -> sub-synthesis -> root; siblings stay dark", () => {
    withTmp("rt-path-", (dir) => {
      generateResearchTree({ stateDir: dir });
      const session = openSession(dir);
      const topology = readTopology(dir);
      const leafFacets = new Set(ALL_LEAVES.map((l) => `leaf:${l}` as Facet));
      const litSubByLeaf: Record<string, string> = {};
      let sawSingleLeafMove = false;

      for (let i = 0; i < session.receipts.length; i++) {
        const r = session.receipts[i]!;
        if (r.node !== GATEWAY || r.status !== "rendered") continue;
        const moved = session.movedFacetsByIndex[i]!;
        const movedLeaves = [...moved].filter((f) => leafFacets.has(f));
        if (movedLeaves.length !== 1) continue;
        sawSingleLeafMove = true;

        const leaf = movedLeaves[0]!.slice("leaf:".length);
        const sub = SUB_OF_LEAF[leaf]!;

        // the gateway wakes EXACTLY the one touched finding lane.
        const gwTargets = propagationTargets({
          topology,
          producer: GATEWAY,
          movedFacets: moved,
          wakeRef: r.content_hash,
        });
        const litFindings = gwTargets
          .map((t) => t.node)
          .filter((n) => n.startsWith(FINDING_PREFIX));
        expect(litFindings).toEqual([`${FINDING_PREFIX}${leaf}`]);

        // trace the drain to the next external wake.
        const drainReceipts: (typeof session.receipts)[number][] = [];
        for (let j = i + 1; j < session.receipts.length; j++) {
          const f = session.receipts[j]!;
          if (f.node === GATEWAY || f.node === "ingress.corpus") break;
          drainReceipts.push(f);
        }
        const findingFailed = drainReceipts.some(
          (f) => f.node === `${FINDING_PREFIX}${leaf}` && f.status === "failed",
        );
        if (findingFailed) continue; // the red-fail beat wakes no ancestor (asserted below)

        const drainRendered = new Set<string>();
        for (const f of drainReceipts)
          if (f.status === "rendered") drainRendered.add(f.node);
        // exactly the depth-bounded ancestor path rendered.
        expect([...drainRendered].sort()).toEqual(
          [`${FINDING_PREFIX}${leaf}`, ROOT, `${SUBSYNTH_PREFIX}${sub}`].sort(),
        );
        for (const other of ["A", "B", "C"]) {
          if (other === sub) continue;
          expect(drainRendered.has(`${SUBSYNTH_PREFIX}${other}`)).toBe(false);
        }
        litSubByLeaf[leaf] = sub;
      }

      expect(sawSingleLeafMove).toBe(true);
      // two different leaf revisions light two DIFFERENT sub-syntheses, SAME root.
      expect(litSubByLeaf["B2"]).toBe("B");
      expect(litSubByLeaf["A1"]).toBe("A");
      const rootRenders = session.receipts.filter(
        (r) => r.node === ROOT && r.status === "rendered",
      );
      expect(rootRenders.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("a failed finding (corrupt source) carries zero fresh and wakes NO ancestor", () => {
    withTmp("rt-fail-", (dir) => {
      generateResearchTree({ stateDir: dir });
      const session = openSession(dir);
      const failed = session.receipts.filter((r) => r.status === "failed");
      expect(failed.length).toBeGreaterThanOrEqual(1);
      expect(failed.some((r) => r.node.startsWith(FINDING_PREFIX))).toBe(true);
      for (const f of failed) expect(f.cost.tokens.fresh).toBe(0);

      const failIdx = session.receipts.findIndex((r) => r.status === "failed");
      for (let j = failIdx + 1; j < session.receipts.length; j++) {
        const f = session.receipts[j]!;
        if (f.node === GATEWAY || f.node === "ingress.corpus") break;
        const ancestorRendered =
          (f.node.startsWith(SUBSYNTH_PREFIX) && f.status === "rendered") ||
          (f.node === ROOT && f.status === "rendered");
        expect(ancestorRendered).toBe(false);
      }
    });
  });

  it("two leaves under one sub-question wake their sub-synthesis EXACTLY once (convergent fan-in)", () => {
    withTmp("rt-conv-", (dir) => {
      generateResearchTree({ stateDir: dir });
      const session = openSession(dir);
      const topology = readTopology(dir);
      let sawTwoLeafSameSub = false;

      for (let i = 0; i < session.receipts.length; i++) {
        const r = session.receipts[i]!;
        if (r.node !== GATEWAY || r.status !== "rendered") continue;
        const moved = session.movedFacetsByIndex[i]!;
        const movedLeaves = [...moved]
          .filter((f) => f.startsWith("leaf:"))
          .map((f) => f.slice(5));
        if (movedLeaves.length < 2) continue;
        const subs = new Set(movedLeaves.map((l) => SUB_OF_LEAF[l]!));
        if (subs.size !== 1) continue;
        sawTwoLeafSameSub = true;

        const sub = [...subs][0]!;
        let subRenders = 0;
        for (let j = i + 1; j < session.receipts.length; j++) {
          const f = session.receipts[j]!;
          if (f.node === GATEWAY || f.node === "ingress.corpus") break;
          if (f.node === `${SUBSYNTH_PREFIX}${sub}` && f.status === "rendered")
            subRenders += 1;
        }
        expect(subRenders).toBe(1);
      }
      expect(sawTwoLeafSameSub).toBe(true);
    });
  });
});
