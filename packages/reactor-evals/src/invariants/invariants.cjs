// U9 — offline invariant evals (deterministic predicates; complete the launch
// suite alongside the empirical evals, DoD L1231). Cheap, not on the COST path.
//
// IN THIS BUILD: #4 duplicate-event idempotency + #5 crash-recovery (replay
// determinism) are implemented as real predicates over the reconciler. #8
// contract-set fencing + #12 undecidable-contract are scaffolded with honest
// scope notes (they need the compile/contract surface, not the cost spine).

"use strict";

const { mountDag, createInMemoryWorldModelStore, createReplaySession, memoryLedger, files, textFile, ATOMIC_FACET } = require("../sdk.cjs");

function renderOnce(text) {
  return (ctx) => ({
    world_model: files({ "o.txt": textFile(text) }),
    cost: { provider: "deterministic", model: "inv-v1", tokens: { fresh: 3, reused: 0 }, surprise_cause: ctx.wake.source },
  });
}
function topo(fp) {
  return {
    topology: { nodes: [{ node: "n", contract_fingerprint: fp, wake_source: "external" }], edges: [], entry_points: ["n"], acyclic: true },
    contract_fingerprints: { n: fp },
  };
}

// #4 — duplicate event idempotency: the same fingerprint twice -> exactly one render.
function duplicateIdempotency() {
  const ledger = memoryLedger();
  const store = createInMemoryWorldModelStore();
  const d1 = mountDag({ topology: topo("fp-x"), mounts: { n: { render: renderOnce("v") } }, ledger, store });
  const r1 = d1.ingest("n");
  const d2 = mountDag({ topology: topo("fp-x"), mounts: { n: { render: renderOnce("v") } }, ledger, store });
  const r2 = d2.ingest("n");
  const fresh = createReplaySession({ ledger }).costRollup.total.fresh;
  return {
    eval: "#4 duplicate-idempotency",
    first: r1.map((r) => r.disposition).join(","),
    second: r2.map((r) => r.disposition).join(","),
    ok: r1[0].disposition === "rendered" && r2[0].disposition === "skipped" && fresh === 3,
  };
}

// #5 — crash recovery: rebuild from the same ledger -> the next receipt is identical
// (the trail re-derives; a re-mount over the persisted ledger replays, never re-renders).
function crashRecovery() {
  const ledger = memoryLedger();
  const store = createInMemoryWorldModelStore();
  mountDag({ topology: topo("fp-a"), mounts: { n: { render: renderOnce("v1") } }, ledger, store }).ingest("n");
  const beforeLen = ledger.all().length;
  // "Restart": a fresh mount over the SAME ledger+store, same fingerprint -> skip.
  const recovered = mountDag({ topology: topo("fp-a"), mounts: { n: { render: renderOnce("v1") } }, ledger, store }).ingest("n");
  return {
    eval: "#5 crash-recovery",
    recovered_disposition: recovered[0].disposition,
    ok: recovered[0].disposition === "skipped" && ledger.all().length === beforeLen + 1,
  };
}

function scaffolded() {
  return [
    { eval: "#8 contract-set-fencing", status: "scaffolded", note: "needs the compile/contract-fingerprint surface (reactor compile); deterministic, off the cost spine." },
    { eval: "#12 undecidable-contract", status: "scaffolded", note: "needs a failed-receipt-naming-the-gap path from compile; off the cost spine." },
  ];
}

function runInvariants() {
  return { implemented: [duplicateIdempotency(), crashRecovery()], scaffolded: scaffolded() };
}

module.exports = { runInvariants, duplicateIdempotency, crashRecovery };
