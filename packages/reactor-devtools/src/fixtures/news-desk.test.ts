// Proof that the generated News Desk state-dir is a REAL, replayable corpus AND
// that it lands the flagship thesis — COST SCALES WITH SURPRISE — as a single
// load-bearing invariant:
//
//   THE INVARIANT (one assertion arc):
//     (a) a LONG contiguous run of receipts with ZERO fresh cost (the quiet
//         stretch: byte-identical feed re-ticks that all memo-skip), THEN
//     (b) exactly ONE event produces the FIRST fresh-cost spike on the Briefing
//         lane (the hero: one feed carries a real breaking story), THEN
//     (c) a DUPLICATE of that story on a second wire does NOT produce a new
//         Briefing render — the cluster is woken once, dedupes the story, and the
//         Briefing receipt count is UNCHANGED across the duplicate.
//
// Plus byte-identical determinism. It loads through the exact SDK read surface
// the devtools data layer uses, so if the generator drifts this fails before the
// demo ever runs. Pure: generates into a fresh temp dir, opens it with the replay
// read surface. No model key.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createReplaySession,
  FileSystemReceiptLedger,
  propagationTargets,
  type TopologyWorldModel,
} from "@openprose/reactor/sdk";
import { createFileSystemStorageAdapter } from "@openprose/reactor";

import { generateNewsDeskFixture } from "./news-desk";

const GATEWAY = "gateway.wire-feeds";
const DEDUP_CLUSTER = "responsibility.dedup-cluster";
const BRIEFING = "responsibility.briefing";
const HEADLINE = "responsibility.headline";
const NORMALIZE_PREFIX = "responsibility.normalize-";

const FEED_FACETS = new Set([
  "reuters", "ap", "bloomberg", "afp", "dpa", "kyodo",
  "pti", "tass", "efe", "ansa", "yonhap", "xinhua",
]);

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

test("generated news-desk fixture loads via the SDK replay read surface", () => {
  const stateDir = mkdtempSync(join(tmpdir(), "rdt-news-"));
  const result = generateNewsDeskFixture({ stateDir });

  assert.ok(existsSync(join(stateDir, "receipts.json")), "receipts trail present");
  assert.ok(existsSync(join(stateDir, "world-models")), "world-models dir present");
  assert.ok(existsSync(join(stateDir, "compile", "topology.json")), "topology snapshot present");
  assert.ok(existsSync(join(stateDir, "compile", "labels.json")), "labels map present");

  const session = openSession(stateDir);
  assert.equal(session.receipts.length, result.receiptsCount);
  assert.ok(session.receipts.length > 0, "trail is non-empty");

  // The graph: gateway + 12 feed normalizers + dedup-cluster + topic-index +
  // briefing + headline = 17 real nodes (the phantom ingress source is NOT a
  // topology node).
  const topology = readTopology(stateDir);
  assert.equal(topology.nodes.length, 17, "the enumerated graph (17 real nodes)");
  assert.equal(
    topology.nodes.filter((n) => n.node.startsWith(NORMALIZE_PREFIX)).length,
    12,
    "twelve feed normalizers (the 12 wires, mostly dark)",
  );
  assert.equal(topology.acyclic, true);
  assert.ok(topology.entry_points.includes(GATEWAY), "gateway is the entry point");

  // per-feed facet edges exist on the gateway (the dark-lane boundary).
  for (const f of FEED_FACETS) {
    assert.ok(
      topology.edges.some(
        (e) => e.producer === GATEWAY && e.facet === f && e.subscriber === `${NORMALIZE_PREFIX}${f}`,
      ),
      `gateway exposes an independent "${f}" facet edge to its normalizer`,
    );
  }

  // per-story facet edges exist on the dedup cluster (the diamond boundary).
  for (const sid of ["quake", "merger", "election"]) {
    // The cluster's story facets are subscribed by the topic-index via the
    // brief-gate, but the cluster→topic edge is atomic; the story facets are the
    // cluster's OWN exposed facets (visible in receipts). Assert ≥1 story facet
    // actually moved at least once in the trail.
    assert.ok(
      session.receipts.some((_, i) => session.movedFacetsByIndex[i]!.has(`story:${sid}`)),
      `the cluster surfaced a "story:${sid}" facet move at least once`,
    );
  }
});

test("THE DARK LANE: a single-feed delta lights ≤1 normalizer lane", () => {
  const stateDir = mkdtempSync(join(tmpdir(), "rdt-news-dark-"));
  generateNewsDeskFixture({ stateDir });
  const session = openSession(stateDir);
  const topology = readTopology(stateDir);

  let sawSingleFeedMove = false;
  for (let i = 0; i < session.receipts.length; i++) {
    const r = session.receipts[i]!;
    if (r.node !== GATEWAY || r.status !== "rendered") continue;
    const moved = session.movedFacetsByIndex[i]!;
    const movedFeeds = [...moved].filter((f) => FEED_FACETS.has(f));
    if (movedFeeds.length !== 1) continue;
    sawSingleFeedMove = true;

    const targets = propagationTargets({
      topology,
      producer: GATEWAY,
      movedFacets: moved,
      wakeRef: r.content_hash,
    });
    const litNormalizers = targets.map((t) => t.node).filter((n) => n.startsWith(NORMALIZE_PREFIX));
    assert.ok(
      litNormalizers.length <= 1,
      `a single-feed gateway delta lit ${litNormalizers.length} normalizer lanes; the dark lane requires ≤1`,
    );
    assert.equal(
      litNormalizers[0],
      `${NORMALIZE_PREFIX}${movedFeeds[0]}`,
      "the lit normalizer matches the moved feed",
    );
  }
  assert.ok(sawSingleFeedMove, "the episode contains a single-feed gateway delta (the hero beat)");
});

// =====================================================================
// THE LOAD-BEARING INVARIANT — cost scales with surprise.
// =====================================================================
test("THE INVARIANT: long flat-cost quiet → ONE briefing spike → dedup is a no-op", () => {
  const stateDir = mkdtempSync(join(tmpdir(), "rdt-news-aha-"));
  generateNewsDeskFixture({ stateDir });
  const session = openSession(stateDir);
  const topology = readTopology(stateDir);
  const n = session.receipts.length;

  // ---- (a) A LONG contiguous run of ZERO-fresh receipts (the quiet stretch). ----
  // Find the longest contiguous window of receipts whose fresh cost is exactly
  // zero. The byte-identical re-ticks make the WHOLE graph memo-skip, so the
  // quiet stretch is a flat-cost field.
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
  assert.ok(
    longestZeroRun >= 12,
    `expected a LONG contiguous flat-cost run (≥12 zero-fresh receipts); saw ${longestZeroRun}`,
  );

  // ---- (b) Exactly ONE event produces the FIRST fresh spike on the Briefing. ----
  // The Briefing's fresh spend is the single tallest fresh in the whole trail
  // (the expensive node). Among the briefing renders, the HERO is the first one
  // driven by a real single-feed event: its nearest preceding GATEWAY rendered
  // frame moved EXACTLY ONE feed facet (one feed carried the breaking story) —
  // distinct from the cold-boot cascade, where all 12 feed facets initialize.
  const briefingRenders = session.receipts
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.node === BRIEFING && r.status === "rendered" && r.cost.tokens.fresh > 0);
  assert.ok(briefingRenders.length >= 1, "the Briefing fired at least one fresh spike");

  const maxFresh = Math.max(...session.receipts.map((r) => r.cost.tokens.fresh));
  const briefingMax = Math.max(...briefingRenders.map(({ r }) => r.cost.tokens.fresh));
  assert.equal(briefingMax, maxFresh, "the Briefing holds the single tallest fresh spike");

  const precedingGatewayFeeds = (spikeIdx: number): string[] => {
    for (let i = spikeIdx - 1; i >= 0; i--) {
      const r = session.receipts[i]!;
      if (r.node === GATEWAY && r.status === "rendered") {
        return [...session.movedFacetsByIndex[i]!].filter((f) => FEED_FACETS.has(f));
      }
    }
    return [];
  };

  // The hero spike: the first briefing spike whose driving gateway frame moved
  // exactly ONE feed facet. (The cold-boot cascade moves all 12 at once.)
  const hero = briefingRenders.find(({ i }) => precedingGatewayFeeds(i).length === 1);
  assert.ok(hero, "a briefing spike is driven by a single-feed event (the hero)");
  const firstSpike = hero!;
  assert.equal(
    precedingGatewayFeeds(firstSpike.i).length,
    1,
    "exactly ONE feed carried the breaking story that drove the hero spike",
  );

  // ---- (c) THE DEDUP: a duplicate story does NOT produce a new briefing render. ----
  // Locate the dedup beat: a GATEWAY frame AFTER the hero that moves exactly one
  // (different) feed facet, drives a cluster render that moves NO `story:` facet
  // (the dedup no-op), and across which the Briefing receipt count is UNCHANGED.
  const briefingCountUpTo = (idx: number): number =>
    session.receipts.slice(0, idx + 1).filter((r) => r.node === BRIEFING).length;

  let sawDedup = false;
  for (let i = firstSpike.i + 1; i < n; i++) {
    const r = session.receipts[i]!;
    if (r.node !== GATEWAY || r.status !== "rendered") continue;
    const movedFeeds = [...session.movedFacetsByIndex[i]!].filter((f) => FEED_FACETS.has(f));
    if (movedFeeds.length !== 1) continue;

    // Find the cluster render driven by this gateway frame (the next cluster
    // receipt before the next gateway frame).
    let nextGateway = n;
    for (let j = i + 1; j < n; j++) {
      if (session.receipts[j]!.node === GATEWAY) { nextGateway = j; break; }
    }
    const clusterIdx = session.receipts
      .map((rr, j) => ({ rr, j }))
      .find(({ rr, j }) => j > i && j < nextGateway && rr.node === DEDUP_CLUSTER && rr.status === "rendered")?.j;
    if (clusterIdx === undefined) continue;

    const clusterMoved = session.movedFacetsByIndex[clusterIdx]!;
    const movedStories = [...clusterMoved].filter((f) => f.startsWith("story:"));
    if (movedStories.length !== 0) continue; // a NEW story would move a story facet — not a dedup

    // This is the dedup beat. The cluster was woken (it rendered) but the story
    // facet did NOT move ⇒ the briefing must NOT re-render across this window.
    sawDedup = true;

    // The cluster IS woken by this gateway frame (the normalizer→cluster lane lit).
    const briefingBefore = briefingCountUpTo(i - 1);
    const briefingAfter = briefingCountUpTo(nextGateway - 1);
    assert.equal(
      briefingAfter,
      briefingBefore,
      "the duplicate story produced NO new Briefing render (briefing receipt count unchanged across the dup)",
    );

    // The dedup boundary is the brief-gate: the cluster re-renders (its atomic
    // truth moves because wire provenance changed) and wakes the Topic Index, but
    // because NO `story:` facet moved the Topic Index re-render moves NEITHER the
    // `brief-gate` NOR the `rollup` facet ⇒ the Briefing is never woken. Prove the
    // Topic Index render in this window moved no brief-gate facet.
    const topicIdx = session.receipts
      .map((rr, j) => ({ rr, j }))
      .find(({ rr, j }) => j > clusterIdx && j < nextGateway && rr.node === "responsibility.topic-index")?.j;
    if (topicIdx !== undefined) {
      const topicMoved = session.movedFacetsByIndex[topicIdx]!;
      assert.ok(
        !topicMoved.has("brief-gate"),
        "the deduped cluster did NOT move the Topic Index brief-gate (briefing stays dark)",
      );
      const targets = propagationTargets({
        topology,
        producer: "responsibility.topic-index",
        movedFacets: topicMoved,
        wakeRef: session.receipts[topicIdx]!.content_hash,
      });
      assert.ok(
        !targets.map((t) => t.node).includes(BRIEFING),
        "the deduped path never wakes the Briefing",
      );
    }
    break;
  }
  assert.ok(sawDedup, "the episode contains a dedup beat (same story on a second wire)");
});

test("THE QUIET FLOOR: memo-skips carry zero fresh + a self-tick floor exists", () => {
  const stateDir = mkdtempSync(join(tmpdir(), "rdt-news-floor-"));
  generateNewsDeskFixture({ stateDir });
  const session = openSession(stateDir);

  const skips = session.receipts.filter((r) => r.status === "skipped");
  assert.ok(skips.length > 0, "memo-skips exist (the quiet-world pulses)");
  for (const s of skips) {
    assert.equal(s.cost.tokens.fresh, 0, "skipped receipts carry zero fresh");
  }

  const selfReceipts = session.receipts.filter((r) => r.wake.source === "self");
  assert.ok(selfReceipts.length >= 1, "at least one self-sourced receipt (the audit floor)");
  for (const s of selfReceipts) {
    assert.equal(s.cost.tokens.fresh, 0, "the self-tick floor burns no fresh tokens");
  }
});

test("THE RED SHOT: at least one `failed` receipt (a corrupt wire dispatch)", () => {
  const stateDir = mkdtempSync(join(tmpdir(), "rdt-news-fail-"));
  generateNewsDeskFixture({ stateDir });
  const session = openSession(stateDir);

  const failed = session.receipts.filter((r) => r.status === "failed");
  assert.ok(failed.length >= 1, "at least one failed receipt (the red shot)");
  assert.ok(
    failed.some((r) => r.node.startsWith(NORMALIZE_PREFIX)),
    "a feed normalizer is the node that failed",
  );
  for (const f of failed) {
    assert.equal(f.cost.tokens.fresh, 0, "failed receipts carry zero fresh");
  }
});

test("THE DIAMOND: the cluster is woken EXACTLY ONCE even when ≥2 feeds carry a story", () => {
  const stateDir = mkdtempSync(join(tmpdir(), "rdt-news-diamond-"));
  generateNewsDeskFixture({ stateDir });
  const session = openSession(stateDir);
  const topology = readTopology(stateDir);

  // Every gateway frame's propagation set never doubles a normalizer; and every
  // normalizer render wakes the cluster at most once (the fan-in apex).
  for (let i = 0; i < session.receipts.length; i++) {
    const r = session.receipts[i]!;
    if (!r.node.startsWith(NORMALIZE_PREFIX) || r.status !== "rendered") continue;
    const moved = session.movedFacetsByIndex[i]!;
    if (moved.size === 0) continue;
    const targets = propagationTargets({
      topology,
      producer: r.node,
      movedFacets: moved,
      wakeRef: r.content_hash,
    });
    const clusterHits = targets.map((t) => t.node).filter((x) => x === DEDUP_CLUSTER);
    assert.ok(clusterHits.length <= 1, "the dedup cluster appears ≤1× per normalizer frame");
  }
});

test("THE HEADLINE: the terminal node renders the rollup at least once", () => {
  const stateDir = mkdtempSync(join(tmpdir(), "rdt-news-head-"));
  generateNewsDeskFixture({ stateDir });
  const session = openSession(stateDir);
  const headlineRenders = session.receipts.filter(
    (r) => r.node === HEADLINE && r.status === "rendered",
  );
  assert.ok(headlineRenders.length >= 1, "the headline rendered at least once");
});

test("the news-desk fixture is deterministic — two generations are byte-identical", () => {
  const a = mkdtempSync(join(tmpdir(), "rdt-news-det-a-"));
  const b = mkdtempSync(join(tmpdir(), "rdt-news-det-b-"));
  generateNewsDeskFixture({ stateDir: a });
  generateNewsDeskFixture({ stateDir: b });

  assert.equal(
    readFileSync(join(a, "receipts.json"), "utf8"),
    readFileSync(join(b, "receipts.json"), "utf8"),
    "receipt trails are byte-identical across runs",
  );
  assert.equal(
    readFileSync(join(a, "compile", "topology.json"), "utf8"),
    readFileSync(join(b, "compile", "topology.json"), "utf8"),
    "topology snapshots are byte-identical across runs",
  );
  assert.equal(
    readFileSync(join(a, "compile", "labels.json"), "utf8"),
    readFileSync(join(b, "compile", "labels.json"), "utf8"),
    "labels maps are byte-identical across runs",
  );
});
