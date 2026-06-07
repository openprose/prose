// U2 (c) — the benchmark topology + the render bodies.
//
// Topology (simultaneous fan-out; NO staggered diamond, per risk R1 / MK-1):
//
//     feed (entry, external, MECHANICAL gateway, workWeight 0)
//       |  ATOMIC facet
//       v
//     digest (input, MODEL-BEARING maintainer, workWeight 1)
//       |  ATOMIC facet
//       +----> brief0, brief1, ... briefN-1  (input, MODEL-BEARING, workWeight 1)
//
// `feed` emits the contestant's PROJECTION of the messy evidence (material for
// reactor, raw for byte-diff, etc.); its facet fingerprint moves iff that
// projection moved. `digest` is the expensive maintainer; the N briefs are the
// amortization sub-track (one upstream facet, N dependents) — when digest's
// material output moves, all N wake; when it does not, all N skip.

"use strict";

const { files, textFile, ATOMIC_FACET } = require("../sdk.cjs");
const { deterministicCost } = require("../cost/deterministic-cost.cjs");

const DIGEST = "digest";
const FEED = "feed";

/** Build the brief node ids for an N-dependent fan-out. */
function briefIds(nDependents) {
  return Array.from({ length: nDependents }, (_, i) => `brief${i}`);
}

/**
 * Build a ReconcilerTopology for one tick.
 *
 * `feedFingerprint` is the contestant's per-tick key for the entry node. When
 * `forceAll` is set (the no-memo controls: oracle-cron, no-memo-reactor,
 * react-loop), EVERY node's contract_fingerprint is bumped with the tick so the
 * memo always misses — a true naive control that re-derives the whole graph
 * every tick (not just the entry). Memoizing contestants leave digest/brief
 * fingerprints fixed and let the reconciler decide via input fingerprints.
 */
function buildTopology(feedFingerprint, nDependents, opts) {
  const forceAll = opts && opts.forceAll;
  const tick = opts ? opts.tick : 0;
  const bump = (base) => (forceAll ? `${base}::t${tick}` : base);
  const briefs = briefIds(nDependents);
  const digestFp = bump("fp-digest");
  const nodes = [
    { node: FEED, contract_fingerprint: feedFingerprint, wake_source: "external" },
    { node: DIGEST, contract_fingerprint: digestFp, wake_source: "input" },
    ...briefs.map((b) => ({ node: b, contract_fingerprint: bump(`fp-${b}`), wake_source: "input" })),
  ];
  const edges = [
    { subscriber: DIGEST, producer: FEED, facet: ATOMIC_FACET },
    ...briefs.map((b) => ({ subscriber: b, producer: DIGEST, facet: ATOMIC_FACET })),
  ];
  const contract_fingerprints = { [FEED]: feedFingerprint, [DIGEST]: digestFp };
  for (const b of briefs) contract_fingerprints[b] = bump(`fp-${b}`);
  return {
    topology: { nodes, edges, entry_points: [FEED], acyclic: true },
    contract_fingerprints,
  };
}

/**
 * Build the per-tick render mounts. `projectionBytes` is what `feed` emits this
 * tick (contestant-dependent); `materialValue` is the churn-free truth the
 * maintainer is a function of (so digest/brief outputs are stable under churn and
 * the world-models stay equal-correctness across contestants).
 */
function buildMounts(projectionBytes, materialValue, nDependents, opts) {
  const briefs = briefIds(nDependents);
  const forceAll = opts && opts.forceAll;
  const tick = opts ? opts.tick : 0;
  // Under a no-memo control, decorate every downstream output with the tick so
  // its facet fingerprint moves every tick -> the whole graph re-renders (a true
  // naive control). Memoizing contestants leave outputs churn-free downstream.
  const dec = (s) => (forceAll ? `${s}::t${tick}` : s);

  // feed: a MECHANICAL gateway — emits the projection, costs 0 fresh (workWeight 0).
  const feedRender = (ctx) => ({
    world_model: files({ "feed.json": textFile(projectionBytes) }),
    cost: deterministicCost(ctx, {
      upstreamBytes: projectionBytes.length,
      outputBytes: projectionBytes.length,
      workWeight: 0,
    }),
  });

  // digest: the expensive maintainer — a function of the MATERIAL value only, so
  // its output (hence facet fingerprint) is stable under immaterial churn.
  const briefingBytes = dec(`BRIEF::${materialValue}`);
  const digestRender = (ctx) => ({
    world_model: files({ "digest.txt": textFile(briefingBytes) }),
    cost: deterministicCost(ctx, {
      upstreamBytes: projectionBytes.length,
      outputBytes: briefingBytes.length,
      workWeight: 1,
    }),
  });

  const mounts = {
    [FEED]: { render: feedRender },
    [DIGEST]: { render: digestRender },
  };
  for (const b of briefs) {
    const summaryBytes = dec(`SUMMARY::${b}::${materialValue}`);
    mounts[b] = {
      render: (ctx) => ({
        world_model: files({ [`${b}.txt`]: textFile(summaryBytes) }),
        cost: deterministicCost(ctx, {
          upstreamBytes: briefingBytes.length,
          outputBytes: summaryBytes.length,
          workWeight: 1,
        }),
      }),
    };
  }
  return mounts;
}

module.exports = { buildTopology, buildMounts, briefIds, FEED, DIGEST };
