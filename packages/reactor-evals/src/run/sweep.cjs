// U3 — the lambda-sweep driver (one ledger per contestant x lambda, real reconciler).
//
// Drives a contestant over a generated cell through the REAL reconciler
// (mountDag/ingest, the EVALS worked-epoch re-mount pattern), reading per-tick
// fresh-token spend straight off the appended receipts (decidability wall: every
// number is a predicate over the ledger). Emits a chain-verifiable receipts trail
// plus the per-tick records the scorers regress on.

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { mountDag, createInMemoryWorldModelStore, createReplaySession, memoryLedger } = require("../sdk.cjs");
const { buildTopology, buildMounts, briefIds, DIGEST } = require("../world/graph.cjs");

/**
 * Run one contestant over one cell.
 * @param {object} contestant  one of CONTESTANTS
 * @param {object} cell        a generateCell(...) result
 * @param {{ nDependents: number, directory?: string }} opts
 * @returns {{ contestant, lambda, perTick, totalFresh, dispositions, correctnessOk, correctRate, receiptCount, ledger }}
 */
function runContestant(contestant, cell, opts) {
  const nDependents = opts.nDependents;
  // Always drive the per-tick loop on an in-memory ledger (in-memory `all()` is
  // O(1) per read; a file ledger re-reads receipts.json from disk every tick =
  // O(ticks^2) disk I/O). The committed `receipts.json` is persisted ONCE below.
  const ledger = memoryLedger();
  const store = createInMemoryWorldModelStore();
  const briefs = briefIds(nDependents);

  const perTick = [];
  const dispositions = { rendered: 0, skipped: 0, failed: 0, coalesced: 0 };

  // Equal-correctness tracking: the contestant's maintained value vs the oracle.
  let maintainedValue = null; // digest's last rendered material value
  let correct = 0;

  let lastLen = 0;
  for (const event of cell.events) {
    const tick = event.tick;
    const materialValue = event.fact.value; // the churn-free truth this tick
    const { fingerprint, bytes } = contestant.project(event, tick);
    const policyOpts = { forceAll: !!contestant.forceAll, tick };

    const topology = buildTopology(fingerprint, nDependents, policyOpts);
    const mounts = buildMounts(bytes, materialValue, nDependents, policyOpts);
    const dag = mountDag({ topology, mounts, ledger, store });
    const results = dag.ingest("feed");

    // Per-tick fresh: sum cost.tokens.fresh over receipts appended this tick.
    const all = ledger.all();
    let tickFresh = 0;
    let digestRendered = false;
    for (let i = lastLen; i < all.length; i++) {
      const r = all[i];
      tickFresh += r.cost.tokens.fresh;
      if (r.node === DIGEST && r.status === "rendered") digestRendered = true;
    }
    lastLen = all.length;

    for (const r of results) {
      if (dispositions[r.disposition] !== undefined) dispositions[r.disposition] += 1;
    }
    if (digestRendered) maintainedValue = materialValue;

    // Equal-correctness: does the maintained truth match the oracle this tick?
    const ok = maintainedValue === oracleValueAt(event);
    if (ok) correct += 1;

    perTick.push({
      tick,
      materially_changed: event_materially(cell, tick),
      fresh: tickFresh,
      digest_rendered: digestRendered,
    });
  }

  const rollup = createReplaySession({ ledger }).costRollup;

  // Persist the committed, chain-verifiable receipts.json ONCE (replay-only).
  if (opts.directory) {
    fs.mkdirSync(opts.directory, { recursive: true });
    fs.writeFileSync(path.join(opts.directory, "receipts.json"), JSON.stringify(ledger.all(), null, 0));
  }

  return {
    contestant: contestant.id,
    provenance: contestant.provenance,
    cost_confidence: contestant.cost_confidence,
    lambda: cell.lambda,
    perTick,
    totalFresh: rollup.total.fresh,
    totalReused: rollup.total.reused,
    dispositions,
    correctRate: correct / cell.events.length,
    correctnessOk: correct === cell.events.length,
    receiptCount: ledger.all().length,
    ledger,
  };
}

// The oracle truth this tick = the entity's true current material value.
function oracleValueAt(event) {
  return event.fact.value;
}
function event_materially(cell, tick) {
  return cell.labels[tick].materially_changed;
}

/**
 * Sweep all contestants across all cells.
 * @param {object[]} contestants
 * @param {object[]} cells       one generateCell per lambda
 * @param {{ nDependents: number, dirFor?: (id, lambda) => string }} opts
 */
function sweep(contestants, cells, opts) {
  const rows = [];
  for (const c of contestants) {
    for (const cell of cells) {
      const directory = opts.dirFor ? opts.dirFor(c.id, cell.lambda) : undefined;
      const r = runContestant(c, cell, { nDependents: opts.nDependents, directory });
      delete r.ledger; // drop the live handle from the serialized row
      rows.push(r);
    }
  }
  return rows;
}

module.exports = { runContestant, sweep };
