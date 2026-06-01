// The oblique-weave TIER-2 GATE — deterministic, offline, zero model spend.
//
// It drives the REAL `@openprose/reactor` reconciler with deterministic fake
// renders and asserts the whole validity contract off the persisted ledger. Its
// body mirrors the README walkthrough; if this breaks, the README is wrong — fix
// both together.
//
// THE ARCHITECTURE this teaches: hidden-context adversarial role composition.
//   - roles are FIRST-CLASS SUBSCRIBERS, each with a DIFFERENT MASKED VIEWPORT of
//     the same truth (the Viewport Policy exposes one masked facet per role; a
//     role wakes only when ITS masked view moves);
//   - a TERMINAL Novelty Auditor whose recommendation becomes a NEW EXPLICIT
//     Weave Config receipt the NEXT epoch — DAG-preserving, no same-epoch cycle.
//
// THE VALIDITY CONTRACT this asserts (plan §5):
//   1. Compiles to the frozen artifact set (topology valid, single-kind entry
//      gateways, acyclic; labels + flat receipts.json + hex world-models present).
//   2. Cold-start renders all nodes; an identical re-wake SKIPS; a skip
//      propagates nothing and wakes nothing.
//   3. cost.surprise_cause === wake.source on every committed receipt.
//   4. ATOMIC_FACET for the facet-less producers; no "*" tokens anywhere.
//   5. Chain-verifies: verifyReceiptChain passes over the raw on-disk receipts.
//   6. Byte-deterministic: a second regeneration is identical.

import { strict as assert } from "node:assert";
import { describe, it } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createFileSystemStorageAdapter } from "@openprose/reactor";
import {
  mountDag,
  createFileSystemReceiptLedger,
  FileSystemReceiptLedger,
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

import { generateObliqueWeaveFixture } from "./generate";

const SIGNALS = "gateway.signals";
const WEAVE = "gateway.weave-config";
const LEDGER = "responsibility.signal-ledger";
const VIEWPORT = "responsibility.viewport-policy";
const ANALOGIST = "responsibility.analogist";
const ADVERSARY = "responsibility.adversary";
const BREAKER = "responsibility.constraint-breaker";
const KEEPER = "responsibility.weirdness-keeper";
const OBLIQUE = "responsibility.oblique-ledger";
const MEMO = "responsibility.surprising-bet";
const AUDITOR = "responsibility.novelty-auditor";

const ROLES = [ANALOGIST, ADVERSARY, BREAKER, KEEPER];
const VIEW_FACET: Record<string, string> = {
  [ANALOGIST]: "view:analogist",
  [ADVERSARY]: "view:adversary",
  [BREAKER]: "view:constraint-breaker",
  [KEEPER]: "view:weirdness-keeper",
};

function tmp(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
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
// (0) THE HIDDEN-CONTEXT WALKTHROUGH, in-process (the README body): a Viewport
//     Policy exposing one MASKED FACET PER ROLE, proving a role wakes IFF its own
//     masked viewport moved — and a quiet re-wake skips at zero fresh. This is the
//     EVALS-style snippet a reader can run by hand from the public SDK.
// ===========================================================================
describe("oblique-weave — masked viewports (a role wakes IFF its slice moved)", () => {
  it("only the role whose masked facet moves re-renders; the siblings stay dark", () => {
    const dir = tmp("oblique-weave-evals-");
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

      // A two-role slice of the weave: the Viewport Policy exposes a per-role
      // masked facet; the Analogist subscribes to view:analogist ONLY, the
      // Adversary to view:adversary ONLY. They wake independently.
      const topology: ReconcilerTopology = {
        topology: {
          nodes: [
            { node: VIEWPORT, contract_fingerprint: "fp-viewport", wake_source: "external" },
            { node: ANALOGIST, contract_fingerprint: "fp-analogist", wake_source: "input" },
            { node: ADVERSARY, contract_fingerprint: "fp-adversary", wake_source: "input" },
          ],
          // each role subscribes to its OWN masked facet (never "*").
          edges: [
            { subscriber: ANALOGIST, producer: VIEWPORT, facet: VIEW_FACET[ANALOGIST]! },
            { subscriber: ADVERSARY, producer: VIEWPORT, facet: VIEW_FACET[ADVERSARY]! },
          ],
          entry_points: [VIEWPORT],
          acyclic: true,
        },
        contract_fingerprints: {
          [VIEWPORT]: "fp-viewport",
          [ANALOGIST]: "fp-analogist",
          [ADVERSARY]: "fp-adversary",
        },
      };

      // The viewport canonicalizer exposes ONE facet per role; only the facet
      // whose masked slice moved gets a new fingerprint, so only that role wakes.
      const viewportCanon = (fm: Record<string, Uint8Array>) => {
        const text = new TextDecoder().decode(fm["out.txt"]!);
        const [analogistSlice, adversarySlice] = text.split("|");
        return {
          [ATOMIC_FACET]: `sha:${text}`,
          [VIEW_FACET[ANALOGIST]!]: `sha:${analogistSlice}`,
          [VIEW_FACET[ADVERSARY]!]: `sha:${adversarySlice}`,
        };
      };

      const mountAt = (viewportText: string) =>
        mountDag({
          topology,
          mounts: {
            [VIEWPORT]: { render: render(viewportText), canonicalizer: viewportCanon },
            [ANALOGIST]: { render: render("analogist thread") },
            [ADVERSARY]: { render: render("adversary thread") },
          },
          ledger,
        });

      // cold: the viewport renders both masked slices; both roles wake.
      const cold = mountAt("A1|B1").ingest(VIEWPORT);
      assert.deepEqual(
        cold.map((r) => `${r.node}:${r.disposition}`).sort(),
        [`${ADVERSARY}:rendered`, `${ANALOGIST}:rendered`, `${VIEWPORT}:rendered`].sort(),
        "cold start renders the viewport and both role lanes",
      );

      // A NEW masked viewport where ONLY the analogist's slice moved (A1→A2; the
      // adversary's B1 is byte-identical). Move the viewport's memo key (a fresh
      // external delivery) so it re-renders, then assert ONLY the analogist woke.
      const topology2: ReconcilerTopology = {
        ...topology,
        topology: { ...topology.topology },
        contract_fingerprints: { ...topology.contract_fingerprints, [VIEWPORT]: "fp-viewport-d2" },
      };
      topology2.topology.nodes = topology.topology.nodes.map((n) =>
        n.node === VIEWPORT ? { ...n, contract_fingerprint: "fp-viewport-d2" } : n,
      );
      const surprise = mountDag({
        topology: topology2,
        mounts: {
          [VIEWPORT]: { render: render("A2|B1"), canonicalizer: viewportCanon },
          [ANALOGIST]: { render: render("analogist thread v2") },
          [ADVERSARY]: { render: render("adversary thread") },
        },
        ledger,
      }).ingest(VIEWPORT);

      const woke = surprise.map((r) => `${r.node}:${r.disposition}`).sort();
      assert.ok(
        woke.includes(`${VIEWPORT}:rendered`),
        "the viewport re-rendered on the fresh delivery",
      );
      assert.ok(
        woke.includes(`${ANALOGIST}:rendered`),
        "the Analogist (its masked slice moved) re-rendered",
      );
      assert.ok(
        !woke.includes(`${ADVERSARY}:rendered`),
        "the Adversary stayed DARK — its masked viewport was byte-identical",
      );

      // cost.surprise_cause === wake.source on EVERY committed receipt.
      for (const r of createReplaySession({ ledger }).receipts) {
        assert.equal(r.cost.surprise_cause, r.wake.source, `surprise_cause==wake.source on ${r.node}`);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ===========================================================================
// (1)–(6) THE COMMITTED FIXTURE: the generator drives the real reconciler and
//     emits the replay/ state-dir. Assert the validity contract off the dir.
// ===========================================================================
describe("oblique-weave — the committed replay fixture (validity contract)", () => {
  it("(1) compiles to the frozen artifact set: two entry gateways, acyclic, labels + hex world-models", () => {
    const dir = tmp("oblique-weave-shape-");
    try {
      const result = generateObliqueWeaveFixture({ stateDir: dir });

      assert.ok(existsSync(join(dir, "receipts.json")), "flat root receipts.json present");
      assert.ok(existsSync(join(dir, "compile", "topology.json")), "topology snapshot present");
      assert.ok(existsSync(join(dir, "compile", "labels.json")), "labels map present");
      assert.ok(existsSync(join(dir, "beats.json")), "beats map present");
      assert.ok(existsSync(join(dir, "world-models")), "world-models dir present");

      const topology = readTopology(dir);
      assert.equal(topology.nodes.length, 11, "eleven real nodes (2 gateways + 9 responsibilities)");
      assert.equal(topology.acyclic, true, "the mounted graph is acyclic (no same-epoch cycle)");
      // two external-driven entry gateways (the Signal Inbox + the Weave Config).
      assert.deepEqual(
        [...topology.entry_points].sort(),
        [SIGNALS, WEAVE].sort(),
        "both gateways are entry points",
      );

      // the four roles each subscribe to ONLY their own masked facet on the
      // viewport policy (the hidden-context boundary).
      for (const role of ROLES) {
        assert.ok(
          topology.edges.some(
            (e) => e.producer === VIEWPORT && e.subscriber === role && e.facet === VIEW_FACET[role],
          ),
          `${role} subscribes to its masked facet ${VIEW_FACET[role]} on the viewport`,
        );
      }

      // the auditor is TERMINAL: nothing subscribes to it, and it has no edge back
      // to the viewport (no same-epoch cycle — the loop closes via a new config).
      assert.ok(
        !topology.edges.some((e) => e.producer === AUDITOR),
        "the Novelty Auditor is terminal — no node subscribes to it",
      );
      assert.ok(
        !topology.edges.some((e) => e.subscriber === VIEWPORT && e.producer === AUDITOR),
        "the auditor has NO edge back to the viewport policy (DAG-preserving)",
      );

      // hex-encoded world-model dirs (e.g. responsibility.analogist → 7265...).
      const wmDirs = readdirSync(join(dir, "world-models"));
      for (const node of [SIGNALS, WEAVE, VIEWPORT, ANALOGIST, MEMO, AUDITOR]) {
        const hex = Buffer.from(node, "utf8").toString("hex");
        assert.ok(wmDirs.includes(hex), `world-model dir for ${node} is hex-encoded (${hex})`);
        assert.ok(
          existsSync(join(dir, "world-models", hex, "published.json")),
          `${node} has a published.json`,
        );
        const versions = readdirSync(join(dir, "world-models", hex, "versions"));
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

  it("(2) cold renders the weave; a quiet re-wake skips; the surprise lights ONE role", () => {
    const dir = tmp("oblique-weave-arc-");
    try {
      generateObliqueWeaveFixture({ stateDir: dir });
      const session = openSession(dir);
      const r = session.receipts;
      const topology = readTopology(dir);

      // (a) cold start renders every node at least once.
      for (const node of [SIGNALS, WEAVE, LEDGER, VIEWPORT, ...ROLES, OBLIQUE, MEMO, AUDITOR]) {
        assert.ok(
          r.some((x) => x.node === node && x.status === "rendered"),
          `${node} rendered at cold start`,
        );
      }

      // (b) THE QUIET SKIP: a re-delivery with the SAME gateway contract skips the
      // signals gateway, which propagates nothing.
      const signalsSkip = r.find((x) => x.node === SIGNALS && x.status === "skipped");
      assert.ok(signalsSkip, "the quiet re-wake produced a signals-gateway skip");
      assert.equal(signalsSkip!.cost.tokens.fresh, 0, "the skip burns zero fresh");
      // a skipped producer moves no facet ⇒ wakes nothing.
      const idx = r.indexOf(signalsSkip!);
      assert.equal(session.movedFacetsByIndex[idx]!.size, 0, "the skip moved no facet");
      assert.equal(
        propagationTargets({
          topology,
          producer: SIGNALS,
          movedFacets: session.movedFacetsByIndex[idx]!,
          wakeRef: signalsSkip!.content_hash,
        }).length,
        0,
        "the skip propagated to nothing",
      );

      // (c) THE SURPRISE: a gateway frame whose viewport re-render moved EXACTLY
      // ONE role's masked facet ⇒ EXACTLY ONE role re-rendered in that window; the
      // other three stayed dark. (This is the hidden-context property on-disk.)
      const viewportRenders = r
        .map((x, i) => ({ x, i }))
        .filter(({ x }) => x.node === VIEWPORT && x.status === "rendered");
      const soloRoleMove = viewportRenders.find(({ i }) => {
        const movedViews = [...session.movedFacetsByIndex[i]!].filter((f) => f.startsWith("view:"));
        return movedViews.length === 1;
      });
      assert.ok(soloRoleMove, "a viewport render moved exactly ONE role's masked facet (the surprise)");

      const movedView = [...session.movedFacetsByIndex[soloRoleMove!.i]!].find((f) =>
        f.startsWith("view:"),
      )!;
      const wokenRole = Object.keys(VIEW_FACET).find((role) => VIEW_FACET[role] === movedView)!;
      const targets = propagationTargets({
        topology,
        producer: VIEWPORT,
        movedFacets: session.movedFacetsByIndex[soloRoleMove!.i]!,
        wakeRef: r[soloRoleMove!.i]!.content_hash,
      });
      const wokenRoles = targets.map((t) => t.node).filter((n) => ROLES.includes(n));
      assert.deepEqual(wokenRoles, [wokenRole], "exactly the role whose masked slice moved was woken");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("(2b) the re-weave closes the loop across an epoch boundary (a new Weave Config receipt)", () => {
    const dir = tmp("oblique-weave-reweave-");
    try {
      generateObliqueWeaveFixture({ stateDir: dir });
      const session = openSession(dir);
      const r = session.receipts;

      // The Weave Config gateway delivered MORE THAN ONCE (the cold config + the
      // auditor-recommended re-weave) — the terminal recommendation became a new
      // explicit config the NEXT epoch.
      const weaveRenders = r.filter((x) => x.node === WEAVE && x.status === "rendered");
      assert.ok(
        weaveRenders.length >= 2,
        "the Weave Config gateway rendered on a SECOND delivery (the auditor re-weave)",
      );

      // The auditor rendered BEFORE the second weave delivery (its recommendation
      // is what drove the operator to apply the new config) — a cross-epoch loop,
      // not a same-epoch cycle.
      const firstAuditor = r.findIndex((x) => x.node === AUDITOR && x.status === "rendered");
      const lastWeaveRender = r.map((x) => x.node === WEAVE && x.status === "rendered").lastIndexOf(true);
      assert.ok(firstAuditor >= 0, "the auditor rendered at least once");
      assert.ok(
        lastWeaveRender > firstAuditor,
        "the re-weave config delivery follows the auditor's recommendation (cross-epoch)",
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("(2c) the cost rollup: byCause partitions total; skips carry zero fresh", () => {
    const dir = tmp("oblique-weave-rollup-");
    try {
      generateObliqueWeaveFixture({ stateDir: dir });
      const session = openSession(dir);

      const { byCause, total } = session.costRollup;
      const buckets = Object.values(byCause);
      assert.equal(buckets.reduce((s, b) => s + b.fresh, 0), total.fresh, "byCause.fresh sums to total.fresh");
      assert.equal(
        buckets.reduce((s, b) => s + b.receipts, 0),
        total.receipts,
        "byCause.receipts sums to total.receipts",
      );

      const trailFresh = session.receipts.reduce((s, x) => s + x.cost.tokens.fresh, 0);
      assert.equal(total.fresh, trailFresh, "the rollup's total.fresh matches the trail");
      assert.ok(total.fresh > 0, "the weave drove real fresh spend");

      for (const x of session.receipts) {
        if (x.status === "skipped" || x.status === "failed") {
          assert.equal(x.cost.tokens.fresh, 0, `${x.node} (${x.status}) carries zero fresh`);
        }
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("(3) cost.surprise_cause === wake.source on every committed receipt", () => {
    const dir = tmp("oblique-weave-cause-");
    try {
      generateObliqueWeaveFixture({ stateDir: dir });
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

  it('(4) ATOMIC_FACET + masked facets only — no "*" wildcard tokens anywhere', () => {
    const dir = tmp("oblique-weave-facet-");
    try {
      generateObliqueWeaveFixture({ stateDir: dir });
      const topoRaw = readFileSync(join(dir, "compile", "topology.json"), "utf8");
      const receiptsRaw = readFileSync(join(dir, "receipts.json"), "utf8");

      assert.ok(!/"\*"/.test(topoRaw), 'no "*" token in topology.json');
      assert.ok(!/"\*"/.test(receiptsRaw), 'no "*" token in receipts.json');

      const topology = readTopology(dir);
      // every edge is either a masked role facet (view:<role>) or the ATOMIC_FACET.
      const allowed = new Set<string>([ATOMIC_FACET, ...Object.values(VIEW_FACET)]);
      for (const e of topology.edges) {
        assert.ok(allowed.has(e.facet), `edge facet "${e.facet}" is ATOMIC_FACET or a named masked facet`);
      }
      // the facet-less producers expose ATOMIC_FACET in their fingerprints.
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
    const dir = tmp("oblique-weave-chain-");
    try {
      generateObliqueWeaveFixture({ stateDir: dir });
      const raw = JSON.parse(readFileSync(join(dir, "receipts.json"), "utf8")) as { node: string }[];
      const allNodes = [SIGNALS, WEAVE, LEDGER, VIEWPORT, ...ROLES, OBLIQUE, MEMO, AUDITOR];
      for (const node of allNodes) {
        const slice = raw.filter((r) => r.node === node);
        assert.ok(slice.length > 0, `${node} has on-disk receipts`);
        const result = verifyReceiptChain(slice);
        assert.equal(result.ok, true, `${node}'s on-disk receipt chain verifies`);
      }

      // also per-node via the replay read view (the same view devtools renders).
      const session = openSession(dir);
      for (const node of allNodes) {
        assert.equal(session.verifyNodeChain(node).ok, true, `${node}'s chain verifies via replay`);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("(6) byte-deterministic: two regenerations produce identical receipts/topology/labels/beats", () => {
    const a = tmp("oblique-weave-det-a-");
    const b = tmp("oblique-weave-det-b-");
    try {
      generateObliqueWeaveFixture({ stateDir: a });
      generateObliqueWeaveFixture({ stateDir: b });
      for (const rel of [
        "receipts.json",
        join("compile", "topology.json"),
        join("compile", "labels.json"),
        "beats.json",
      ]) {
        assert.equal(
          readFileSync(join(a, rel), "utf8"),
          readFileSync(join(b, rel), "utf8"),
          `${rel} is byte-identical across regenerations`,
        );
      }
    } finally {
      rmSync(a, { recursive: true, force: true });
      rmSync(b, { recursive: true, force: true });
    }
  });
});
