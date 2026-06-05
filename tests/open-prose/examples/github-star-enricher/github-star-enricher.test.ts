// The github-star-enricher TIER-2 GATE — deterministic, offline, zero model
// spend, zero network. It drives the REAL `@openprose/reactor` reconciler with
// deterministic fake renders (a DRY-RUN/synthetic-safe GitHub + Exa adapter) and
// asserts the whole validity contract off the persisted ledger. Its body mirrors
// the README walkthrough; if this breaks, the README is wrong — fix both together.
//
// THE VALIDITY CONTRACT this asserts (plan §5):
//   1. Compiles to the frozen artifact set (topology valid, single entry gateway
//      per external surface, acyclic; labels + flat receipts.json + hex
//      world-models present).
//   2. Cold-start renders all nodes; an identical re-poll SKIPS all; a skip
//      propagates nothing and wakes nothing.
//   3. cost.surprise_cause === wake.source on every committed receipt.
//   4. ATOMIC_FACET for facet-less producers; no "*" tokens anywhere.
//   5. Chain-verifies: verifyReceiptChain passes over the raw on-disk receipts.
//   6. Byte-deterministic: a second regeneration is identical.
//
// PLUS the example's four flagship lessons, each a load-bearing assertion:
//   A. PER-PERSON FAN-OUT — three independent stargazer lanes.
//   B. SHARED COMPANY RECEIPTS — alice + bob fan into ONE acme company render.
//   C. COST-GATED ENRICHMENT — casey (low-signal) never pays for Exa; no sample.
//   D. A HARD HUMAN GATE — alice's packet reaches ready_for_review and STOPS;
//      auto_send is false on every packet (the system never auto-sends).
//
// PLUS the marquee in-process drive (the EVALS.md snippet shape): a hand-mounted
// gateway→responsibility over a temp ledger; a quiet re-wake keeps total.fresh
// flat; a contract_fingerprint edit moves it. Cost scales with surprise.

import { strict as assert } from "node:assert";
import { describe, it } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createFileSystemStorageAdapter,
} from "@openprose/reactor";
import {
  FileSystemWorldModelStore,
  readTextFile,
} from "@openprose/reactor/adapters";
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
import {
  FileSystemReceiptLedger,
} from "@openprose/reactor/adapters";
import {
  propagationTargets,
  type ReconcilerTopology,
  type TopologyWorldModel,
} from "@openprose/reactor/internals";

import { generateGithubStarEnricherFixture } from "./generate";

const GATEWAY = "gateway.star-events";
const HUMAN_REVIEW = "gateway.human-review";
const REGISTRY = "responsibility.registry";
const USERS = ["alice", "bob", "casey"] as const;
const FOOTPRINT = (u: string) => `responsibility.footprint-${u}`;
const PERSON = (u: string) => `responsibility.person-${u}`;
const COMPANY = (c: string) => `responsibility.company-${c}`;
const INTENT = (u: string) => `responsibility.intent-${u}`;
const SAMPLE = (u: string) => `responsibility.sample-${u}`;
const OUTREACH = (u: string) => `responsibility.outreach-${u}`;

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

// Read a node's published truth THROUGH the SDK world-model store (the same read
// surface the reconciler + devtools use) — the version blobs are an OPWM binary
// format, not plain JSON, so we must go through the store, not parse the .bin.
function readNodeTruth<T = Record<string, unknown>>(stateDir: string, node: string): T | null {
  const store = new FileSystemWorldModelStore({ directory: join(stateDir, "world-models") });
  const read = store.read(node, "published");
  if (read.ref.version === null) return null;
  const bytes = read.files["truth.json"];
  if (bytes === undefined) return null;
  return JSON.parse(readTextFile(bytes)) as T;
}

// ===========================================================================
// (0) THE EVALS.md SNIPPET shape, run verbatim in-process: the marquee
//     skipped/fresh=0 frame + the surprise-render-on-contract-move. The README
//     body. Proves the tenet on the smallest possible slice before the fixture.
// ===========================================================================
describe("github-star-enricher — the cost-scales-with-surprise walkthrough", () => {
  it("a quiet re-poll skips (fresh flat); a contract edit renders + propagates", () => {
    const dir = tmp("gse-evals-");
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
            { node: GATEWAY, contract_fingerprint: "fp-gateway", wake_source: "external" },
            { node: REGISTRY, contract_fingerprint: "fp-registry", wake_source: "input" },
          ],
          edges: [{ subscriber: REGISTRY, producer: GATEWAY, facet: ATOMIC_FACET }],
          entry_points: [GATEWAY],
          acyclic: true,
        },
        contract_fingerprints: { [GATEWAY]: "fp-gateway", [REGISTRY]: "fp-registry" },
      };
      const dag = mountDag({
        topology,
        mounts: {
          [GATEWAY]: { render: render("stars-v1") },
          [REGISTRY]: { render: render("registry of v1") },
        },
        ledger,
      });

      const cold = dag.ingest(GATEWAY);
      assert.deepEqual(
        cold.map((r) => `${r.node}:${r.disposition}`).sort(),
        [`${GATEWAY}:rendered`, `${REGISTRY}:rendered`].sort(),
        "cold-start renders both nodes",
      );

      const quiet = dag.ingest(GATEWAY);
      assert.deepEqual(
        quiet.map((r) => `${r.node}:${r.disposition}`),
        [`${GATEWAY}:skipped`],
        "an identical re-poll skips the gateway; a skip propagates nothing",
      );
      assert.equal(
        createReplaySession({ ledger }).costRollup.total.fresh,
        2,
        "the skip cost 0 fresh — total stays at the two cold renders",
      );

      const topology2: ReconcilerTopology = {
        topology: {
          nodes: [
            { node: GATEWAY, contract_fingerprint: "fp-gateway-v2", wake_source: "external" },
            { node: REGISTRY, contract_fingerprint: "fp-registry", wake_source: "input" },
          ],
          edges: [{ subscriber: REGISTRY, producer: GATEWAY, facet: ATOMIC_FACET }],
          entry_points: [GATEWAY],
          acyclic: true,
        },
        contract_fingerprints: { [GATEWAY]: "fp-gateway-v2", [REGISTRY]: "fp-registry" },
      };
      const dag2 = mountDag({
        topology: topology2,
        mounts: {
          [GATEWAY]: { render: render("stars-v2") },
          [REGISTRY]: { render: render("registry of v2") },
        },
        ledger,
      });
      const surprise = dag2.ingest(GATEWAY);
      assert.deepEqual(
        surprise.map((r) => `${r.node}:${r.disposition}`).sort(),
        [`${GATEWAY}:rendered`, `${REGISTRY}:rendered`].sort(),
        "a moved contract_fingerprint renders the gateway and wakes the registry",
      );
      assert.equal(
        createReplaySession({ ledger }).costRollup.total.fresh,
        4,
        "two more renders → fresh moves 2 → 4 (cost scales with surprise)",
      );

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
// (1) THE COMMITTED FIXTURE — the validity contract off the persisted dir.
// ===========================================================================
describe("github-star-enricher — the committed replay fixture (validity contract)", () => {
  it("(1) compiles to the frozen artifact set: external entry gateways, acyclic, labels + hex world-models", () => {
    const dir = tmp("gse-shape-");
    try {
      const result = generateGithubStarEnricherFixture({ stateDir: dir });

      assert.ok(existsSync(join(dir, "receipts.json")), "flat root receipts.json present");
      assert.ok(existsSync(join(dir, "compile", "topology.json")), "topology snapshot present");
      assert.ok(existsSync(join(dir, "compile", "labels.json")), "labels map present");
      assert.ok(existsSync(join(dir, "beats.json")), "beats map present");
      assert.ok(existsSync(join(dir, "world-models")), "world-models dir present");

      const topology = readTopology(dir);
      assert.equal(topology.acyclic, true, "the graph is acyclic");
      // The two external-driven entry points: the star gateway + the human-review
      // gateway. They are the ONLY entry points (every other node is input-driven).
      assert.deepEqual(
        [...topology.entry_points].sort(),
        [GATEWAY, HUMAN_REVIEW].sort(),
        "exactly the two external-driven gateways are entry points",
      );
      for (const ep of topology.entry_points) {
        const node = topology.nodes.find((n) => n.node === ep)!;
        assert.equal(node.wake_source, "external", `${ep} is external-driven`);
      }
      // every non-entry node is input-driven (woken only by an upstream move).
      for (const n of topology.nodes) {
        if (topology.entry_points.includes(n.node)) continue;
        assert.equal(n.wake_source, "input", `${n.node} is input-driven`);
      }

      // hex-encoded world-model dirs for every rendered node.
      const wmDirs = readdirSync(join(dir, "world-models"));
      const allNodes = topology.nodes.map((n) => n.node);
      for (const node of allNodes) {
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

  it("(2) cold fan-out renders all nodes; a quiet re-poll SKIPS the gateway and wakes nothing", () => {
    const dir = tmp("gse-arc-");
    try {
      generateGithubStarEnricherFixture({ stateDir: dir });
      const session = openSession(dir);
      const r = session.receipts;
      const topology = readTopology(dir);

      // Cold start: every topology node renders at least once.
      const rendered = new Set(r.filter((x) => x.status === "rendered").map((x) => x.node));
      for (const n of topology.nodes.map((n) => n.node)) {
        assert.ok(rendered.has(n), `${n} rendered at least once on cold start`);
      }

      // THE QUIET RE-POLL: the LAST receipt is the star gateway memo-SKIP, and a
      // skip propagates nothing — so it is the TERMINAL receipt (no node is woken
      // after it). This is the marquee frame: an identical re-poll, fresh 0, the
      // graph stays dark. Cost scales with surprise, not with poll frequency.
      const last = r[r.length - 1]!;
      assert.equal(last.node, GATEWAY, "the final receipt is the star gateway");
      assert.equal(last.status, "skipped", "the quiet re-poll memo-skipped the gateway");
      assert.equal(last.cost.tokens.fresh, 0, "the skip burns zero fresh");

      // EVERY skipped receipt (the terminal re-poll AND the diamond-reuse skips in
      // the cold cascade, e.g. bob waking the already-rendered shared company)
      // carries zero fresh and was driven by a memo HIT — a skip never spends.
      for (const s of r.filter((x) => x.status === "skipped")) {
        assert.equal(s.cost.tokens.fresh, 0, `the ${s.node} skip burns zero fresh`);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("(2c) the SHARED company receipt is REUSED: bob waking acme after alice memo-skips it", () => {
    const dir = tmp("gse-reuse-");
    try {
      generateGithubStarEnricherFixture({ stateDir: dir });
      const session = openSession(dir);
      const acme = COMPANY("acme");
      const acmeReceipts = session.receipts.filter((x) => x.node === acme);
      // The diamond's second arm: company.acme is woken twice (alice's footprint,
      // then bob's) but renders ONCE — the second wake is a memo HIT (skipped,
      // fresh 0). The shared enrichment is paid once and reused, not re-run.
      assert.ok(acmeReceipts.length >= 2, "company.acme was woken by both footprints");
      assert.equal(
        acmeReceipts.filter((x) => x.status === "rendered").length,
        1,
        "company.acme rendered EXACTLY once (the shared receipt)",
      );
      assert.ok(
        acmeReceipts.some((x) => x.status === "skipped"),
        "the second arm of the diamond memo-SKIPS the shared company render (reuse, not re-spend)",
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("(2b) the cost rollup: byCause partitions total exactly; the surprise drove real fresh spend", () => {
    const dir = tmp("gse-rollup-");
    try {
      generateGithubStarEnricherFixture({ stateDir: dir });
      const session = openSession(dir);
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
      const totalFresh = session.receipts.reduce((s, x) => s + x.cost.tokens.fresh, 0);
      assert.equal(total.fresh, totalFresh, "the rollup total.fresh matches the trail");
      assert.ok(total.fresh > 0, "the cold fan-out drove real fresh spend");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("(3) cost.surprise_cause === wake.source on every committed receipt", () => {
    const dir = tmp("gse-cause-");
    try {
      generateGithubStarEnricherFixture({ stateDir: dir });
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

  it("(4) ATOMIC_FACET for facet-less producers — no \"*\" wildcard tokens anywhere", () => {
    const dir = tmp("gse-facet-");
    try {
      generateGithubStarEnricherFixture({ stateDir: dir });
      const topoRaw = readFileSync(join(dir, "compile", "topology.json"), "utf8");
      const receiptsRaw = readFileSync(join(dir, "receipts.json"), "utf8");
      assert.ok(!/"\*"/.test(topoRaw), 'no "*" token in topology.json');
      assert.ok(!/"\*"/.test(receiptsRaw), 'no "*" token in receipts.json');

      // every rendered receipt exposes the atomic facet (facet-less producers).
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
    const dir = tmp("gse-chain-");
    try {
      generateGithubStarEnricherFixture({ stateDir: dir });
      const raw = JSON.parse(readFileSync(join(dir, "receipts.json"), "utf8")) as { node: string }[];
      const nodes = [...new Set(raw.map((r) => r.node))];
      for (const node of nodes) {
        const slice = raw.filter((r) => r.node === node);
        assert.ok(slice.length > 0, `${node} has on-disk receipts`);
        const result = verifyReceiptChain(slice);
        assert.equal(result.ok, true, `${node}'s on-disk receipt chain verifies`);
      }
      const session = openSession(dir);
      for (const node of nodes) {
        assert.equal(session.verifyNodeChain(node).ok, true, `${node}'s chain verifies via replay`);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("(6) byte-deterministic: two regenerations produce identical receipts/topology/labels/beats", () => {
    const a = tmp("gse-det-a-");
    const b = tmp("gse-det-b-");
    try {
      generateGithubStarEnricherFixture({ stateDir: a });
      generateGithubStarEnricherFixture({ stateDir: b });
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

// ===========================================================================
// (2) THE FOUR FLAGSHIP LESSONS — the architecture this example stakes out.
// ===========================================================================
describe("github-star-enricher — the flagship lessons", () => {
  it("(A) PER-PERSON FAN-OUT: three independent stargazer footprint lanes render", () => {
    const dir = tmp("gse-fanout-");
    try {
      generateGithubStarEnricherFixture({ stateDir: dir });
      const session = openSession(dir);
      const topology = readTopology(dir);

      for (const u of USERS) {
        assert.ok(
          session.receipts.some((r) => r.node === FOOTPRINT(u) && r.status === "rendered"),
          `footprint lane for ${u} rendered`,
        );
        // each footprint subscribes to ONLY its own eligibility facet.
        const edge = topology.edges.find((e) => e.subscriber === FOOTPRINT(u) && e.producer === REGISTRY);
        assert.ok(edge, `${u}'s footprint subscribes to the registry`);
        assert.equal(edge!.facet, `eligible:${u}`, `${u}'s footprint subscribes to its OWN eligibility facet`);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("(B) SHARED COMPANY RECEIPTS: alice + bob fan into ONE acme company render (a diamond)", () => {
    const dir = tmp("gse-shared-");
    try {
      generateGithubStarEnricherFixture({ stateDir: dir });
      const session = openSession(dir);
      const topology = readTopology(dir);

      // The diamond: BOTH alice's and bob's footprints feed company.acme; BOTH
      // alice's and bob's intent scorers subscribe to the SAME company.acme node.
      const acme = COMPANY("acme");
      const intoAcme = topology.edges.filter((e) => e.subscriber === acme).map((e) => e.producer).sort();
      assert.deepEqual(
        intoAcme,
        [FOOTPRINT("alice"), FOOTPRINT("bob")].sort(),
        "company.acme fans IN from alice + bob footprints (the shared-enrichment key)",
      );
      for (const u of ["alice", "bob"]) {
        assert.ok(
          topology.edges.some((e) => e.subscriber === INTENT(u) && e.producer === acme),
          `${u}'s intent scorer consumes the SHARED company.acme receipt`,
        );
      }

      // The company is enriched ONCE — exactly one rendered company.acme receipt
      // across the whole cold cascade (shared spend, not once-per-stargazer).
      const acmeRenders = session.receipts.filter((r) => r.node === acme && r.status === "rendered");
      assert.equal(acmeRenders.length, 1, "company.acme rendered EXACTLY once (shared across alice + bob)");

      // casey's company (solo) is a SEPARATE node — the shared key is per-company.
      assert.notEqual(COMPANY("solo"), acme, "casey's company is a distinct node");
      assert.ok(
        topology.nodes.some((n) => n.node === COMPANY("solo")),
        "casey maps to her own solo company resolver, not acme",
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("(C) COST-GATED ENRICHMENT: the low-signal user never pays for Exa; the high-fit user does", () => {
    const dir = tmp("gse-cost-");
    try {
      generateGithubStarEnricherFixture({ stateDir: dir });
      const session = openSession(dir);

      // casey is below the enrichment threshold: her person resolver renders, but
      // CHEAP — it never made the expensive Exa call. alice/bob (above threshold)
      // pay the ~6× Exa fresh cost. The gate is visible as a cost cliff.
      const freshOf = (node: string): number => {
        const rec = session.receipts.find((r) => r.node === node && r.status === "rendered");
        return rec?.cost.tokens.fresh ?? -1;
      };
      const caseyExa = freshOf(PERSON("casey"));
      const aliceExa = freshOf(PERSON("alice"));
      assert.ok(caseyExa >= 0 && aliceExa >= 0, "both person resolvers rendered");
      assert.ok(
        aliceExa > caseyExa * 3,
        `the cost gate is real: alice's Exa render (${aliceExa}) is far costlier than casey's gated-off render (${caseyExa})`,
      );

      // casey's truth records the gate was CLOSED (no Exa sources gathered).
      const caseyPerson = readNodeTruth<{ enriched: boolean; exa_sources: unknown[] }>(dir, PERSON("casey"));
      assert.ok(caseyPerson, "casey's person truth is readable on disk");
      assert.equal(caseyPerson!.enriched, false, "casey was NOT Exa-enriched (cost gate closed)");
      assert.deepEqual(caseyPerson!.exa_sources, [], "no Exa People call was made for casey");

      // and casey never reaches a sample build (build_sample track is gated off).
      const caseySample = readNodeTruth<{ built: boolean }>(dir, SAMPLE("casey"));
      assert.ok(caseySample, "casey's sample truth is readable");
      assert.equal(caseySample!.built, false, "no sample program was built for the low-signal user");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("(D) A HARD HUMAN GATE: alice's packet reaches ready_for_review and STOPS; nothing auto-sends", () => {
    const dir = tmp("gse-human-");
    try {
      generateGithubStarEnricherFixture({ stateDir: dir });

      // alice (high-fit) produced an execution-backed sample and a packet that
      // reached `ready_for_review` — drafted + packaged, NOT sent.
      const aliceSample = readNodeTruth<{ built: boolean; run_status: string }>(dir, SAMPLE("alice"));
      assert.ok(aliceSample, "alice's sample truth is readable");
      assert.equal(aliceSample!.built, true, "alice's sample program was built");
      assert.equal(aliceSample!.run_status, "dry-run-ok", "the sample was RUN on synthetic-safe inputs (execution-backed)");

      const alicePacket = readNodeTruth<{ status: string; auto_send: boolean }>(dir, OUTREACH("alice"));
      assert.ok(alicePacket, "alice's outreach packet truth is readable");
      assert.equal(alicePacket!.status, "ready_for_review", "alice's packet STOPS at ready_for_review (the human gate)");

      // THE INVARIANT: auto_send is false on EVERY outreach packet. The system
      // drafts + packages but never sends — only a human (via the human-review
      // gateway) can advance a packet to sent_by_human.
      for (const u of USERS) {
        const packet = readNodeTruth<{ status: string; auto_send: boolean }>(dir, OUTREACH(u));
        assert.ok(packet, `${u}'s outreach packet is readable`);
        assert.equal(packet!.auto_send, false, `${u}'s packet never auto-sends`);
        assert.notEqual(packet!.status, "sent_by_human", `${u}'s packet was NOT sent (no human action in this episode)`);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("the per-person fan-out is real: a single gateway user-facet move lights ≤1 footprint lane", () => {
    const dir = tmp("gse-darklane-");
    try {
      generateGithubStarEnricherFixture({ stateDir: dir });
      const session = openSession(dir);
      const topology = readTopology(dir);

      // Sanity: the gateway's propagation never doubles a single user's footprint.
      for (let i = 0; i < session.receipts.length; i++) {
        const r = session.receipts[i]!;
        if (r.node !== GATEWAY || r.status !== "rendered") continue;
        const moved = session.movedFacetsByIndex[i]!;
        const targets = propagationTargets({
          topology,
          producer: GATEWAY,
          movedFacets: moved,
          wakeRef: r.content_hash,
        });
        // each target appears at most once (no double-wake of the registry).
        const seen = new Set<string>();
        for (const t of targets) {
          assert.ok(!seen.has(t.node), `${t.node} woken at most once per gateway frame`);
          seen.add(t.node);
        }
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("(A2) MOVE ONE STARGAZER (replay-backed): new evidence on alice lights ONLY her lane; bob + casey stay DARK", () => {
    const dir = tmp("gse-moveone-");
    try {
      generateGithubStarEnricherFixture({ stateDir: dir });
      const session = openSession(dir);
      const r = session.receipts;

      // Find the committed `changed_input` beat: the gateway render whose ONLY
      // moved per-person facet is `user:alice` (the rest of the gateway frames are
      // the cold all-users fan-out, the per-bob retry beats, and the quiet skip).
      const aliceFrame = r.findIndex(
        (x, i) =>
          x.node === GATEWAY &&
          x.status === "rendered" &&
          session.movedFacetsByIndex[i]!.has(`user:alice`) &&
          !session.movedFacetsByIndex[i]!.has(`user:bob`) &&
          !session.movedFacetsByIndex[i]!.has(`user:casey`),
      );
      assert.ok(aliceFrame >= 0, "a committed gateway frame moves ONLY user:alice (the move-one-stargazer beat)");

      // The window from that gateway frame to the next external (SOURCE/gateway)
      // wake is alice's isolated cascade. Within it: footprint-ALICE re-renders;
      // footprint-bob and footprint-casey NEVER render (their lanes stay dark).
      let end = r.length;
      for (let i = aliceFrame + 1; i < r.length; i++) {
        if (r[i]!.node === GATEWAY || r[i]!.node === "ingress.star-events") {
          end = i;
          break;
        }
      }
      const window = r.slice(aliceFrame, end);
      const renderedIn = (node: string) =>
        window.some((x) => x.node === node && x.status === "rendered");

      assert.ok(renderedIn(FOOTPRINT("alice")), "alice's footprint lane is re-woken by her new evidence");
      assert.ok(!renderedIn(FOOTPRINT("bob")), "bob's footprint lane stays DARK (a sibling never wakes)");
      assert.ok(!renderedIn(FOOTPRINT("casey")), "casey's footprint lane stays DARK (a sibling never wakes)");

      // The move is ABSORBED at the footprint boundary: alice's footprint re-renders
      // to byte-identical truth, so its facets DON'T move and nothing deeper re-runs.
      const aliceFp = window.find((x) => x.node === FOOTPRINT("alice") && x.status === "rendered");
      const aliceFpIdx = r.indexOf(aliceFp!);
      assert.equal(
        session.movedFacetsByIndex[aliceFpIdx]!.size,
        0,
        "alice's footprint re-render moved NO facet — the change is absorbed (no deeper re-run)",
      );
      assert.ok(
        !window.some((x) => x.node === PERSON("alice") && x.status === "rendered"),
        "alice's (expensive) person resolver does NOT re-run — the absorbed move never reaches it",
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("(E) A FAILED EXTERNAL CALL IS DEBUGGABLE: person-bob's Exa outage fails LOUD (named adapter), then RECOVERS", () => {
    const dir = tmp("gse-fail-");
    try {
      generateGithubStarEnricherFixture({ stateDir: dir });
      const session = openSession(dir);
      const bob = PERSON("bob");
      const bobReceipts = session.receipts.filter((x) => x.node === bob);

      // The committed trajectory carries a real FAILURE on person-bob (the Exa
      // People adapter is down) — NOT a fabricated truth.
      const failed = bobReceipts.find((x) => x.status === "failed");
      assert.ok(failed, "person-bob has a committed `failed` receipt (the Exa outage)");

      // THE FIX: a failed render is DEBUGGABLE, not an anonymous red node. The
      // failed receipt's cost NAMES the adapter that broke (provider/model) instead
      // of the bare `none`/`none` the generic thrown-render path stamps.
      assert.equal(failed!.cost.provider, "exa", "the failed receipt names the failing provider (exa)");
      assert.equal(failed!.cost.model, "exa-people", "the failed receipt names the failing call (exa-people)");
      assert.equal(failed!.cost.tokens.fresh, 0, "a failed render commits nothing → zero fresh");
      // THE INVARIANT holds on failures too: surprise_cause === the wake source.
      assert.equal(
        failed!.cost.surprise_cause,
        failed!.wake.source,
        "surprise_cause === wake.source even on the failed receipt",
      );

      // A failure propagates NOTHING: the moved facets on the failed receipt are
      // empty, so nothing downstream of person-bob was woken by it.
      const failedIdx = session.receipts.indexOf(failed!);
      assert.equal(session.movedFacetsByIndex[failedIdx]!.size, 0, "a failed render moves no facet (propagates nothing)");

      // And the lane RECOVERS: after the adapter comes back up, a later person-bob
      // receipt RENDERS (the Exa call succeeds — the heavy ~6× fresh spend returns).
      const recovered = bobReceipts.slice(bobReceipts.indexOf(failed!) + 1).find((x) => x.status === "rendered");
      assert.ok(recovered, "person-bob RECOVERS on a later wake (Exa back up → renders)");
      assert.ok(recovered!.cost.tokens.fresh > failed!.cost.tokens.fresh, "the recovery render pays the real Exa fresh spend");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
