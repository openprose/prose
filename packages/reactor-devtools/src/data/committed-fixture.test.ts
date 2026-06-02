// DATA-LAYER UNIT TESTS against the COMMITTED fixture (`fixtures/masked-relay`),
// asserting the derived frames match the corpus's KNOWN dispositions. The other
// data tests (`snapshot.test.ts`, `state-dir.test.ts`) prove the derivation logic
// against synthetic receipts and a freshly-generated dir; THIS file pins the exact
// numbers the launch demo replays, so a drift in the committed bytes fails loudly
// here before the video is ever recorded.
//
// Pure replay: open the saved dir, build the snapshot. No model key, no reactor.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { join } from "node:path";

import { openStateDir, buildSnapshot, type ReceiptFrame } from "./index";

const FIXTURE = join(__dirname, "..", "..", "fixtures", "masked-relay");

const MASKER = "responsibility.viewport-masker";
const EXPANDER_1 = "responsibility.expander-1";
const EXPANDER_2 = "responsibility.expander-2";
const AUDITOR = "responsibility.diversity-auditor";

function snapshot() {
  return buildSnapshot(openStateDir(FIXTURE));
}

test("committed fixture: topology + frame counts are the known corpus shape", () => {
  const snap = snapshot();
  assert.equal(snap.hasTopology, true);
  assert.equal(snap.nodes.length, 12, "12 graph nodes");
  assert.equal(snap.edges.length, 23, "23 per-facet lanes");
  assert.equal(snap.frames.length, 77, "77 receipts in the scripted episode");
  assert.deepEqual(snap.entryPoints, ["gateway.signal-inbox"]);
  assert.equal(snap.acyclic, true);
});

test("committed fixture: which nodes FLASH vs SKIP (the disposition vocabulary)", () => {
  const snap = snapshot();
  const rendered = snap.frames.filter((f) => f.status === "rendered");
  const skipped = snap.frames.filter((f) => f.status === "skipped");
  const failed = snap.frames.filter((f) => f.status === "failed");

  // The scripted episode is cold-boot → surprise → no-change re-wake (a field of
  // memo-skips) → surprise. So there are both real renders and real skips.
  assert.ok(rendered.length > 0, "renders exist (flash cascade)");
  assert.equal(skipped.length, 31, "31 memo-skips (the quiet-world dim pulses)");
  assert.equal(failed.length, 0, "no failures in this corpus");
  assert.equal(rendered.length + skipped.length, snap.frames.length);

  // A skip moved nothing and cost zero fresh — the flat-line invariant.
  for (const s of skipped) {
    assert.equal(s.movedFacets.length, 0, "a skip moved no facet");
    assert.equal(s.edgesToLight.length, 0, "a skip lights no lane");
    assert.equal(s.wokenSubscribers.length, 0, "a skip wakes nothing");
    assert.equal(s.cost.fresh, 0, "a skip burns zero fresh");
  }

  // Every node that renders is either a drawn topology node OR the phantom ingress
  // source (`ingress.signal-inbox`) — the system's edge that injects external
  // evidence. The ingress is NOT in the drawn `nodes` list (it has no contract),
  // but it IS a producer in the edges (the gateway subscribes to its `inbox`
  // facet), so it lights the ingress→gateway lane when a new signal arrives. That
  // is the relay's entry surprise. Nothing ELSE flashes off the declared set.
  const nodeIds = new Set(snap.nodes.map((n) => n.id));
  const PHANTOM_INGRESS = "ingress.signal-inbox";
  const producers = new Set(snap.edges.map((e) => e.producer));
  for (const r of rendered) {
    assert.ok(
      nodeIds.has(r.node) || r.node === PHANTOM_INGRESS,
      `${r.node} is on the graph (or the phantom ingress)`,
    );
  }
  // The phantom ingress is an off-graph PRODUCER: its renders that move the `inbox`
  // facet light exactly the one ingress→gateway lane and wake only the gateway.
  assert.ok(producers.has(PHANTOM_INGRESS), "ingress is a producer in the edges");
  for (const r of rendered.filter((f) => f.node === PHANTOM_INGRESS)) {
    if (r.movedFacets.includes("inbox")) {
      assert.deepEqual(
        r.wokenSubscribers,
        ["gateway.signal-inbox"],
        "an ingress signal wakes only the gateway",
      );
    } else {
      assert.equal(r.edgesToLight.length, 0, "an unmoved ingress render lights nothing");
    }
  }
});

test("committed fixture: the masker's per-facet edge lights + diamond single-wake", () => {
  const snap = snapshot();
  const maskerRenders = snap.frames.filter(
    (f) => f.node === MASKER && f.status === "rendered",
  );
  assert.equal(maskerRenders.length, 3, "the masker renders three times (3 surprises)");

  for (const f of maskerRenders) {
    // It moves @atomic + both consumer view facets each surprise.
    assert.deepEqual(
      [...f.movedFacets].sort(),
      ["@atomic", "view_e1", "view_e2"],
      "masker moves @atomic + both view facets",
    );
    // SELECTOR BOUNDARY: exactly the per-facet lanes light — view_e1 → expander-1,
    // view_e2 → expander-2 (the @atomic move lights no lane: no @atomic edge fans
    // out of the masker; the auditor subscribes on the masker's @atomic).
    const lit = f.edgesToLight
      .map((e) => `${e.facet}->${e.subscriber}`)
      .sort();
    assert.deepEqual(
      lit,
      [
        `@atomic->${AUDITOR}`,
        `view_e1->${EXPANDER_1}`,
        `view_e2->${EXPANDER_2}`,
      ].sort(),
      "the masker lights exactly its three subscriber lanes",
    );
    // DIAMOND SINGLE-WAKE: three distinct subscribers, each woken exactly once,
    // even though the auditor is reachable both directly and (via the relay) by
    // multiple moved facets.
    assert.deepEqual(
      [...f.wokenSubscribers].sort(),
      [AUDITOR, EXPANDER_1, EXPANDER_2].sort(),
      "expanders + auditor woken",
    );
    assert.equal(
      new Set(f.wokenSubscribers).size,
      f.wokenSubscribers.length,
      "no subscriber woken twice",
    );
    assert.equal(
      f.wokenSubscribers.filter((n) => n === AUDITOR).length,
      1,
      "the diamond node (auditor) wakes exactly once",
    );
  }
});

test("committed fixture: every lit lane is a real edge whose facet the frame moved", () => {
  const snap = snapshot();
  const edgeKey = (e: { producer: string; subscriber: string; facet: string }) =>
    `${e.producer} ${e.subscriber} ${e.facet}`;
  const topoEdges = new Set(snap.edges.map(edgeKey));

  let everLit = false;
  for (const f of snap.frames) {
    if (f.edgesToLight.length > 0) everLit = true;
    for (const lit of f.edgesToLight) {
      assert.equal(lit.producer, f.node, "a lit lane fans out FROM the frame's node");
      assert.ok(topoEdges.has(edgeKey(lit)), "a lit lane is a real topology edge");
      assert.ok(f.movedFacets.includes(lit.facet), "a lit lane's facet moved this frame");
    }
    // woken set is exactly the distinct subscribers of the lit lanes.
    const distinctLaneSubs = new Set(f.edgesToLight.map((e) => e.subscriber));
    assert.equal(
      f.wokenSubscribers.length,
      distinctLaneSubs.size,
      "woken = distinct lit-lane subscribers",
    );
  }
  assert.ok(everLit, "at least one render lit a propagation lane");
});

test("committed fixture: costRollup totals are the known fresh/reused spend", () => {
  const snap = snapshot();
  const { total, byCause } = snap.costRollup;

  // KNOWN totals of the deterministic corpus (the meter's endpoints).
  assert.equal(total.fresh, 27180, "total fresh tokens");
  assert.equal(total.reused, 12840, "total reused tokens");
  assert.equal(total.receipts, snap.frames.length, "every receipt counted");

  // byCause partitions the totals exactly.
  const sum = (pick: (b: { fresh: number; reused: number; receipts: number }) => number) =>
    Object.values(byCause).reduce((acc, b) => acc + pick(b), 0);
  assert.equal(sum((b) => b.fresh), total.fresh, "byCause fresh sums to total");
  assert.equal(sum((b) => b.reused), total.reused, "byCause reused sums to total");
  assert.equal(sum((b) => b.receipts), total.receipts, "byCause receipts sum to total");

  // The cause buckets are the wake-source vocabulary (input / self / external).
  for (const cause of Object.keys(byCause)) {
    assert.ok(
      ["input", "self", "external"].includes(cause),
      `cause '${cause}' is a wake source`,
    );
  }
  // External ingress drove fresh spend at least once (the gateway surprises).
  assert.ok((byCause["external"]?.fresh ?? 0) > 0, "external cause spent fresh");
});

test("committed fixture: every frame is index-aligned and well-typed", () => {
  const snap = snapshot();
  snap.frames.forEach((f: ReceiptFrame, i: number) => {
    assert.equal(f.index, i, "frame.index = position");
    assert.ok(["rendered", "skipped", "failed"].includes(f.status));
    assert.ok(["input", "self", "external"].includes(f.wakeSource));
    assert.ok(Array.isArray(f.movedFacets));
    assert.ok(Array.isArray(f.edgesToLight));
    assert.ok(Array.isArray(f.wokenSubscribers));
    assert.equal(typeof f.cost.fresh, "number");
    assert.equal(typeof f.cost.reused, "number");
    assert.equal(typeof f.atomicVersion, "string");
    assert.equal(typeof f.contentHash, "string");
  });
});
