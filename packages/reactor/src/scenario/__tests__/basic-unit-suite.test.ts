// The basic unit suite (tests/basic-unit-suite.md U00–U12) re-expressed as named
// acceptance scenarios over the shared Counter mini-fixture, driven through the
// REAL reconciler with deterministic fake renders (no model calls). This is the
// suite the spec says to build first — the minimum green bar the larger examples
// (Masked Relay, Agent State Observatory, Forme Fixpoint) stand on.
//
// Covered here: the recommended minimum bar (U00, U01, U02, U03, U04, U07, U10)
// plus the second tier that falls out of this fixture (U05, U06, U08, U11, U12).
// U09 (self-driven recheck on `valid_until` lapse) is the one case this fixture
// does not yet drive and is a deliberate follow-up.

import { deepEqual, equal, notEqual, ok } from "node:assert/strict";
import { test } from "node:test";

import { ATOMIC_FACET } from "../../shapes";
import { files, jsonFile } from "../../world-model";
import {
  ALERT_PROJECTION,
  ALERT_STATE,
  COUNTS,
  COUNT_SUMMARY,
  COUNT_TREND,
  EXECUTIVE_SNAPSHOT,
  FORMAT_ALERT_COPY,
  GATEWAY,
  RAW_EVENTS,
  RAW_EVENT_AUDITOR,
  STRUCTURED,
  counterScenario,
  deliverEvent,
  formatAlertCopy,
  projectionCanon,
} from "../fake-render";
import { contractFingerprint, readJson } from "../fixture";
import {
  countDisposition,
  dispositionOf,
  facetFingerprint,
  lastReceipt,
  receiptsFor,
  woke,
} from "../trace";

// --- U00 — Contract inventory -----------------------------------------------

test("U00 contract inventory: stable fingerprints, cosmetic-immune, moved by material change", () => {
  const scn = counterScenario();

  // every declared node has a stable contract fingerprint
  for (const d of scn.decls) {
    equal(scn.topology.contract_fingerprints[d.id], contractFingerprint(d));
  }

  // the FUNCTION (Format Alert Copy) is never mounted as a subscribable node
  equal(
    scn.topology.topology.nodes.find((n) => n.node === FORMAT_ALERT_COPY),
    undefined,
  );

  const base = scn.decls.find((d) => d.id === GATEWAY);
  ok(base);
  // whitespace / comments live only in the excluded prose mirror → no move
  const cosmetic = {
    ...base,
    source: `${base.source ?? ""}\n\n   # a trailing comment   `,
  };
  equal(contractFingerprint(cosmetic), contractFingerprint(base));
  // a Maintains facet change DOES move it
  notEqual(
    contractFingerprint({ ...base, maintains: [...base.maintains, "extra"] }),
    contractFingerprint(base),
  );
  // a Requires change DOES move it
  notEqual(
    contractFingerprint({ ...base, requires: [{ producer: GATEWAY }] }),
    contractFingerprint(base),
  );
});

// --- U11 — Gateway entrypoint registration ----------------------------------

test("U11 entrypoint registration: only gateways are entry points; the graph is acyclic", () => {
  const scn = counterScenario();
  deepEqual(scn.topology.topology.entry_points, [GATEWAY]);
  ok(!scn.topology.topology.entry_points.includes(COUNT_SUMMARY));
  equal(scn.topology.topology.acyclic, true);
});

// --- U01 — Gateway ingress receipt ------------------------------------------

test("U01 gateway ingress: ledger updates, both facets move, replay does not duplicate", () => {
  const scn = counterScenario();
  const r = deliverEvent(scn, { id: "e1", kind: "alpha", value: 1 });

  equal(dispositionOf(r, GATEWAY), "rendered");
  const rec = lastReceipt(scn.ledger, GATEWAY);
  ok(rec);
  ok(rec.fingerprints[RAW_EVENTS]);
  ok(rec.fingerprints[COUNTS]);

  const truth = readJson(scn.store, GATEWAY);
  deepEqual(truth?.["events"], [{ id: "e1", kind: "alpha", value: 1 }]);

  // replay the same event id: the gateway dedups, the counts fingerprint is stable
  const countsBefore = facetFingerprint(scn.ledger, GATEWAY, COUNTS);
  deliverEvent(scn, { id: "e1", kind: "alpha", value: 1 });
  const after = readJson(scn.store, GATEWAY);
  equal((after?.["events"] as unknown[]).length, 1);
  equal(facetFingerprint(scn.ledger, GATEWAY, COUNTS), countsBefore);
});

// --- U02 — Single responsibility render -------------------------------------

test("U02 single responsibility render: wakes, writes truth, signs a receipt naming its input", () => {
  const scn = counterScenario();
  deliverEvent(scn, { id: "e1", kind: "alpha", value: 1 });

  equal(scn.deps.renders[COUNT_SUMMARY], 1);
  const rec = lastReceipt(scn.ledger, COUNT_SUMMARY);
  ok(rec);
  equal(rec.status, "rendered");
  ok(rec.contract_fingerprint);
  // it cited exactly the gateway's `counts` facet as its consumed input
  deepEqual(rec.input_fingerprints, [
    facetFingerprint(scn.ledger, GATEWAY, COUNTS),
  ]);
  // the committed world-model is structured + canonicalizable
  equal(readJson(scn.store, COUNT_SUMMARY)?.["total"], 1);
});

// --- U03 — No-change memo skip ----------------------------------------------

test("U03 memo skip: unmoved input ⇒ no render, prior truth stands, no downstream wake", () => {
  const scn = counterScenario();
  deliverEvent(scn, { id: "e1", kind: "alpha", value: 1 });

  const rendersBefore = scn.deps.renders[COUNT_SUMMARY];
  const truthBefore = readJson(scn.store, COUNT_SUMMARY);

  // wake Count Summary again with UNMOVED counts → cheap skipped receipt, no render
  const again = scn.dag.ingest(COUNT_SUMMARY);
  equal(dispositionOf(again, COUNT_SUMMARY), "skipped");
  equal(scn.deps.renders[COUNT_SUMMARY], rendersBefore); // render body never ran
  deepEqual(readJson(scn.store, COUNT_SUMMARY), truthBefore); // prior CountSummary intact

  // and a no-op upstream re-render (duplicate event) does not wake it at all
  const dup = deliverEvent(scn, { id: "e1", kind: "alpha", value: 1 });
  ok(!woke(dup, COUNT_SUMMARY));
});

// --- U04 — Linear propagation -----------------------------------------------

test("U04 linear propagation: a moved upstream wakes the downstream chain, each once", () => {
  const scn = counterScenario();
  deliverEvent(scn, { id: "e1", kind: "alpha", value: 1 }); // cold cascade
  const r = deliverEvent(scn, { id: "e2", kind: "alpha", value: 1 }); // total 1 → 2

  for (const n of [GATEWAY, COUNT_SUMMARY, ALERT_STATE, ALERT_PROJECTION]) {
    equal(countDisposition(r, n, "rendered"), 1, `${n} rendered exactly once`);
  }
  // wake order follows the DAG
  const order = r.map((x) => x.node);
  ok(order.indexOf(GATEWAY) < order.indexOf(COUNT_SUMMARY));
  ok(order.indexOf(COUNT_SUMMARY) < order.indexOf(ALERT_STATE));
  ok(order.indexOf(ALERT_STATE) < order.indexOf(ALERT_PROJECTION));
});

// --- U05 — Facet subscription -----------------------------------------------

test("U05 facet subscription: raw_events moves, counts does not — selective wake", () => {
  const scn = counterScenario();
  deliverEvent(scn, { id: "e1", kind: "alpha", value: 1 });
  const auditBefore = scn.deps.renders[RAW_EVENT_AUDITOR] ?? 0;
  const summaryBefore = scn.deps.renders[COUNT_SUMMARY] ?? 0;

  // metadata-only event: accepted into raw_events, excluded from counts
  const r = deliverEvent(scn, { id: "m1", kind: "note", value: 0, meta: true });

  ok(woke(r, RAW_EVENT_AUDITOR));
  equal(scn.deps.renders[RAW_EVENT_AUDITOR], auditBefore + 1);
  ok(!woke(r, COUNT_SUMMARY)); // counts facet unmoved → Count Summary never wakes
  equal(scn.deps.renders[COUNT_SUMMARY], summaryBefore);
});

// --- U06 — Diamond single wake ----------------------------------------------

test("U06 diamond single wake: Executive Snapshot renders once for the input tuple", () => {
  const scn = counterScenario();
  deliverEvent(scn, { id: "e1", kind: "alpha", value: 1 });
  const before = scn.deps.renders[EXECUTIVE_SNAPSHOT] ?? 0;

  // e3 moves all three inbound paths (alert, audit, trend) at once
  const r = deliverEvent(scn, { id: "e3", kind: "beta", value: 1 });

  equal(countDisposition(r, EXECUTIVE_SNAPSHOT, "rendered"), 1);
  equal((scn.deps.renders[EXECUTIVE_SNAPSHOT] ?? 0) - before, 1);
});

// --- U07 — Function boundary ------------------------------------------------

test("U07 function boundary: Format Alert Copy runs inside the render, never a node", () => {
  const scn = counterScenario();
  deliverEvent(scn, { id: "e1", kind: "alpha", value: 1 });

  // no node, no edge, no receipt for the function
  equal(
    scn.topology.topology.nodes.find((n) => n.node === FORMAT_ALERT_COPY),
    undefined,
  );
  ok(
    !scn.topology.topology.edges.some(
      (e) => e.producer === FORMAT_ALERT_COPY || e.subscriber === FORMAT_ALERT_COPY,
    ),
  );
  equal(receiptsFor(scn.ledger, FORMAT_ALERT_COPY).length, 0);

  // its output appears INSIDE the projection — proof it ran in-render
  const alert = readJson(scn.store, ALERT_STATE);
  const proj = readJson(scn.store, ALERT_PROJECTION);
  const expected = formatAlertCopy(alert ?? {}).subject;
  ok((proj?.["markdown"] as string).includes(expected));
});

// --- U08 — Projection boundary ----------------------------------------------

test("U08 projection boundary: cosmetic markdown churn does not move the structured facet", () => {
  // The canonicalizer treats markdown/html as derived projections EXCLUDED from
  // the structured facet: same structured truth ⇒ same `structured` token even
  // when the rendered markdown differs (so a structured-facet subscriber would
  // not wake). The byte-level `@atomic` token does move — that is the difference.
  const structured = { status: "quiet", total: 1 };
  const a = projectionCanon(
    files({
      "truth.json": jsonFile({ structured_summary: structured, markdown: "# A", html: "x" }),
    }),
  );
  const b = projectionCanon(
    files({
      "truth.json": jsonFile({
        structured_summary: structured,
        markdown: "## A — reworded",
        html: "x",
      }),
    }),
  );
  equal(a[STRUCTURED], b[STRUCTURED]); // structured truth unmoved
  notEqual(a[ATOMIC_FACET], b[ATOMIC_FACET]); // bytes changed
});

// --- U10 — Failure containment ----------------------------------------------

test("U10 failure containment: a failed render keeps prior truth and does not propagate", () => {
  const scn = counterScenario();
  deliverEvent(scn, { id: "e1", kind: "alpha", value: 1 }); // Alert State renders ok
  const priorAlert = readJson(scn.store, ALERT_STATE);

  scn.deps.failAlertState = true;
  const r = deliverEvent(scn, { id: "e2", kind: "alpha", value: 1 }); // total → 2; Alert State throws

  equal(dispositionOf(r, ALERT_STATE), "failed");
  equal(lastReceipt(scn.ledger, ALERT_STATE)?.status, "failed");
  deepEqual(readJson(scn.store, ALERT_STATE), priorAlert); // prior valid truth stands
  ok(!woke(r, ALERT_PROJECTION)); // downstream not woken from a failed output
});

// --- U12 — Deterministic replay ---------------------------------------------

test("U12 deterministic replay: identical events ⇒ identical world-model fingerprints", () => {
  const run = () => {
    const scn = counterScenario();
    deliverEvent(scn, { id: "e1", kind: "alpha", value: 1 });
    deliverEvent(scn, { id: "e2", kind: "beta", value: 1 });
    return [
      GATEWAY,
      COUNT_SUMMARY,
      ALERT_STATE,
      ALERT_PROJECTION,
      COUNT_TREND,
      EXECUTIVE_SNAPSHOT,
    ].map((n) => [n, lastReceipt(scn.ledger, n)?.fingerprints[ATOMIC_FACET]]);
  };
  deepEqual(run(), run());
});
