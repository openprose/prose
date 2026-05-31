// Tests for the ReplaySession shaping helper (replay-session.ts) — the tiny,
// pure-data view over an already-opened receipt ledger that the DevTools package
// and the SURPRISE-COST benchmark read (plan 2026-05-31-reactor-devtools §3.2 /
// §3.6). Covers ordering, the per-node chain index, the moved-facet diff (proven
// to REUSE the exported `movedFacetsBetween`, not reinvent it), the cumulative
// fresh/reused/$ cost rollup bucketed by `surprise_cause`, integration with
// `verifyReceiptChain`, and the empty-ledger edge case.
//
// Fixtures are built by appending REAL receipts through `InMemoryReceiptLedger`
// (which stamps + verifies each envelope, exactly like the durable ledger),
// threading each append's returned content hash as the next receipt's `prev` so
// the per-node chains are well-formed (verifyReceiptChain-clean). This mirrors
// the fixture pattern in fs-ledger.test.ts.

import { deepEqual, equal, ok } from "node:assert/strict";
import { test } from "node:test";

import {
  ATOMIC_FACET,
  type ContentAddress,
  type FingerprintMap,
  type Receipt,
  type WakeSource,
} from "../../shapes";
import { createNullSignature } from "../../receipt";
import { movedFacetsBetween } from "../../reactor";
import { InMemoryReceiptLedger } from "../mounted-dag";
import { createReplaySession } from "../replay-session";

// A minimal valid receipt body for node `node`, chained off `prev`, publishing
// the given fingerprint map. `status: "skipped"` forces the zero-fresh `none`
// provider (receipt validation enforces this), modelling a coalesced re-wake.
function receiptBody(opts: {
  node: string;
  fingerprints: FingerprintMap;
  prev: ContentAddress | null;
  status?: "rendered" | "skipped";
  surprise_cause?: WakeSource;
  fresh?: number;
  reused?: number;
}): Receipt {
  const status = opts.status ?? "rendered";
  const skipped = status === "skipped";
  const cost = {
    provider: skipped ? "none" : "openrouter",
    model: skipped ? "none" : "google/gemini-3.5-flash",
    tokens: {
      fresh: skipped ? 0 : (opts.fresh ?? 10),
      reused: skipped ? 0 : (opts.reused ?? 0),
    },
    surprise_cause: opts.surprise_cause ?? "external",
  };
  return {
    node: opts.node,
    contract_fingerprint: `c:${opts.node}@1`,
    wake: { source: cost.surprise_cause, refs: [] },
    input_fingerprints: [],
    fingerprints: opts.fingerprints,
    semantic_diff: {},
    prev: opts.prev,
    status,
    cost,
    sig: createNullSignature(),
  };
}

function fp(token: string, extra?: Record<string, string>): FingerprintMap {
  return { [ATOMIC_FACET]: token, ...extra };
}

test("ordering: session.receipts equals ledger.all() in append order", () => {
  const ledger = new InMemoryReceiptLedger();
  const a1 = ledger.append(receiptBody({ node: "alpha", fingerprints: fp("a1"), prev: null }));
  ledger.append(receiptBody({ node: "beta", fingerprints: fp("b1"), prev: null }));
  ledger.append(receiptBody({ node: "alpha", fingerprints: fp("a2"), prev: a1 }));

  const session = createReplaySession({ ledger });

  deepEqual(session.receipts, ledger.all());
  // Append order is the replay timeline.
  deepEqual(
    session.receipts.map((r) => [r.node, r.fingerprints[ATOMIC_FACET]]),
    [
      ["alpha", "a1"],
      ["beta", "b1"],
      ["alpha", "a2"],
    ],
  );
});

test("per-node chain index: receipts grouped by node, ordered, verifyReceiptChain ok", () => {
  const ledger = new InMemoryReceiptLedger();
  const a1 = ledger.append(receiptBody({ node: "alpha", fingerprints: fp("a1"), prev: null }));
  const b1 = ledger.append(receiptBody({ node: "beta", fingerprints: fp("b1"), prev: null }));
  const a2 = ledger.append(receiptBody({ node: "alpha", fingerprints: fp("a2"), prev: a1 }));
  ledger.append(receiptBody({ node: "beta", fingerprints: fp("b2"), prev: b1 }));
  ledger.append(receiptBody({ node: "alpha", fingerprints: fp("a3"), prev: a2 }));

  const session = createReplaySession({ ledger });

  // Grouped on receipt.node.
  deepEqual([...session.chainByNode.keys()].sort(), ["alpha", "beta"]);

  const alpha = session.chainByNode.get("alpha");
  ok(alpha);
  deepEqual(
    alpha?.map((r) => r.fingerprints[ATOMIC_FACET]),
    ["a1", "a2", "a3"],
  );
  const beta = session.chainByNode.get("beta");
  deepEqual(
    beta?.map((r) => r.fingerprints[ATOMIC_FACET]),
    ["b1", "b2"],
  );

  // A well-formed prev-linked chain verifies.
  const result = session.verifyNodeChain("alpha");
  ok(result.ok);
  equal(result.ok ? result.length : -1, 3);

  // Unknown node -> empty-chain ok result (length 0).
  const unknown = session.verifyNodeChain("nope");
  ok(unknown.ok);
  equal(unknown.ok ? unknown.length : -1, 0);
});

test("moved-facet diff: cold start moves all, a single changed facet moves one, skipped moves none", () => {
  const ledger = new InMemoryReceiptLedger();
  // r1: cold start on alpha publishing two facets.
  const r1 = ledger.append(
    receiptBody({ node: "alpha", fingerprints: fp("a1", { title: "T1" }), prev: null }),
  );
  // r2: only @atomic moved (title unchanged).
  const r2 = ledger.append(
    receiptBody({ node: "alpha", fingerprints: fp("a2", { title: "T1" }), prev: r1 }),
  );
  // r3: skipped — copies the SAME fingerprints forward, nothing moved.
  ledger.append(
    receiptBody({
      node: "alpha",
      fingerprints: fp("a2", { title: "T1" }),
      prev: r2,
      status: "skipped",
    }),
  );

  const session = createReplaySession({ ledger });
  const [m1, m2, m3] = session.movedFacetsByIndex;
  ok(m1 && m2 && m3);

  // Cold start: every published facet moved.
  deepEqual(new Set(m1), new Set([ATOMIC_FACET, "title"]));
  // Only the atomic facet token changed.
  deepEqual(new Set(m2), new Set([ATOMIC_FACET]));
  // Skipped receipt copied fingerprints forward => empty moved set.
  equal(m3.size, 0);

  // Index-aligned movedFacetsFor returns the same sets.
  const [rc0, rc1, rc2] = session.receipts;
  ok(rc0 && rc1 && rc2);
  deepEqual(new Set(session.movedFacetsFor(rc0)), new Set(m1));
  deepEqual(new Set(session.movedFacetsFor(rc1)), new Set(m2));
  deepEqual(new Set(session.movedFacetsFor(rc2)), new Set(m3));

  // Cross-check against a DIRECT movedFacetsBetween call to prove reuse, not
  // reinvention: r2's diff is r1.fingerprints -> r2.fingerprints.
  deepEqual(
    new Set(session.movedFacetsFor(rc1)),
    new Set(movedFacetsBetween(rc0.fingerprints, rc1.fingerprints)),
  );
  // And r1's cold-start diff is (null -> r1.fingerprints).
  deepEqual(
    new Set(session.movedFacetsFor(rc0)),
    new Set(movedFacetsBetween(null, rc0.fingerprints)),
  );

  // An UNKNOWN receipt (not from this trail) falls back to a cold-start full move.
  const foreign = { ...rc0, node: "ghost" };
  deepEqual(
    new Set(session.movedFacetsFor(foreign)),
    new Set(movedFacetsBetween(null, foreign.fingerprints)),
  );
});

test("cost rollup: fresh/reused accumulate, skipped adds zero fresh, buckets sum to total", () => {
  const ledger = new InMemoryReceiptLedger();
  // input-caused fresh spend.
  ledger.append(
    receiptBody({
      node: "alpha",
      fingerprints: fp("a1"),
      prev: null,
      surprise_cause: "input",
      fresh: 100,
      reused: 5,
    }),
  );
  // self-caused fresh spend.
  ledger.append(
    receiptBody({
      node: "beta",
      fingerprints: fp("b1"),
      prev: null,
      surprise_cause: "self",
      fresh: 30,
      reused: 2,
    }),
  );
  // external-caused fresh spend.
  const e1 = ledger.append(
    receiptBody({
      node: "gamma",
      fingerprints: fp("g1"),
      prev: null,
      surprise_cause: "external",
      fresh: 7,
      reused: 0,
    }),
  );
  // a skipped receipt contributes a receipt count but ZERO fresh/reused.
  ledger.append(
    receiptBody({
      node: "gamma",
      fingerprints: fp("g1"),
      prev: e1,
      status: "skipped",
      surprise_cause: "external",
    }),
  );

  const session = createReplaySession({ ledger });
  const { byCause, total } = session.costRollup;

  equal(byCause.input.fresh, 100);
  equal(byCause.input.reused, 5);
  equal(byCause.input.receipts, 1);

  equal(byCause.self.fresh, 30);
  equal(byCause.self.reused, 2);

  // external: the rendered receipt (7 fresh) + the skipped one (0 fresh, counted).
  equal(byCause.external.fresh, 7);
  equal(byCause.external.reused, 0);
  equal(byCause.external.receipts, 2);

  // The grand total is the sum across all buckets.
  equal(total.fresh, 100 + 30 + 7);
  equal(total.reused, 5 + 2 + 0);
  equal(total.receipts, 4);
  equal(total.fresh, byCause.input.fresh + byCause.self.fresh + byCause.external.fresh);
  equal(total.reused, byCause.input.reused + byCause.self.reused + byCause.external.reused);
  equal(total.receipts, byCause.input.receipts + byCause.self.receipts + byCause.external.receipts);

  // Default pricing is zero -> deterministic dollars.
  equal(total.dollars, 0);
});

test("cost rollup: coarse $ pricing applies freshRate (and reusedRate when set)", () => {
  const ledger = new InMemoryReceiptLedger();
  ledger.append(
    receiptBody({
      node: "alpha",
      fingerprints: fp("a1"),
      prev: null,
      surprise_cause: "input",
      fresh: 1000,
      reused: 500,
    }),
  );

  // fresh-only pricing.
  const a = createReplaySession({ ledger }, { cost: { freshRate: 0.002 } });
  equal(a.costRollup.total.dollars, 1000 * 0.002);

  // fresh + reused pricing.
  const b = createReplaySession({ ledger }, { cost: { freshRate: 0.002, reusedRate: 0.0005 } });
  equal(b.costRollup.total.dollars, 1000 * 0.002 + 500 * 0.0005);
});

test("array input form: a direct receipt trail is accepted (no ledger needed)", () => {
  const ledger = new InMemoryReceiptLedger();
  const a1 = ledger.append(receiptBody({ node: "alpha", fingerprints: fp("a1"), prev: null }));
  ledger.append(receiptBody({ node: "alpha", fingerprints: fp("a2"), prev: a1 }));

  const receipts = ledger.all();
  const session = createReplaySession({ receipts });

  deepEqual(session.receipts, receipts);
  const alpha = session.chainByNode.get("alpha");
  equal(alpha?.length, 2);
  ok(session.verifyNodeChain("alpha").ok);
});

test("empty-ledger edge case: empty receipts -> empty rollup + empty chain index, no throw", () => {
  const ledger = new InMemoryReceiptLedger();
  const session = createReplaySession({ ledger });

  equal(session.receipts.length, 0);
  equal(session.chainByNode.size, 0);
  equal(session.movedFacetsByIndex.length, 0);

  const { byCause, total } = session.costRollup;
  for (const bucket of [byCause.input, byCause.self, byCause.external, total]) {
    equal(bucket.receipts, 0);
    equal(bucket.fresh, 0);
    equal(bucket.reused, 0);
    equal(bucket.dollars, 0);
  }

  // An unknown node still yields the empty-chain ok result.
  const result = session.verifyNodeChain("anything");
  ok(result.ok);
  equal(result.ok ? result.length : -1, 0);
});
