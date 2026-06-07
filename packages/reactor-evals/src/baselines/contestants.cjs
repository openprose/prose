// U4 — the six contestants/baselines (same world, same render, temp 0).
//
// Every contestant is the SAME reconciler driven over the SAME event tape; they
// differ ONLY in the PROJECTION POLICY that decides the entry node's per-tick
// fingerprint + emitted bytes. Each carries a mandatory `provenance` label and a
// `cost_confidence` tier. One offline predicate scores all six because all six
// emit the same Receipt[] shape.
//
//   reactor          memo on the MATERIAL projection (churn-free)      -> skips churn
//   oracle-cron      forced new fingerprint every tick                 -> renders every tick (yardstick)
//   content-cache    memo on whitespace-normalized raw                 -> catches exact/ws dups, blind to semantics
//   no-memo-reactor  nonce every tick (degenerate canonicalizer)       -> renders every tick (ablation)
//   byte-diff        memo on EXACT raw bytes                           -> cosmetic re-wording over-renders
//   react-loop       wall-clock heartbeat, content-independent         -> flat-and-high, lambda-independent anchor

"use strict";

const crypto = require("node:crypto");
const { materialProjection, hash } = require("../world/material.cjs");

function h(s) {
  return crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);
}
function normalizeWS(s) {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * A contestant is { id, provenance, cost_confidence, project(event, tick) }.
 * `project` returns { fingerprint, bytes }: the entry node's contract_fingerprint
 * for this tick and the bytes `feed` emits (what flows downstream).
 */
const CONTESTANTS = [
  {
    id: "reactor",
    provenance: "runtime-reactor",
    cost_confidence: "deterministic-surrogate",
    project(event) {
      const proj = materialProjection(event.fact); // churn-free material projection
      return { fingerprint: `mat-${h(proj)}`, bytes: proj };
    },
  },
  {
    id: "oracle-cron",
    provenance: "naive-control",
    cost_confidence: "deterministic-surrogate",
    forceAll: true, // re-derives EVERY node every tick (true naive control / yardstick)
    project(event, tick) {
      return { fingerprint: `cron-${tick}-${h(event.raw)}`, bytes: `${materialProjection(event.fact)}::tick${tick}` };
    },
  },
  {
    id: "content-cache",
    provenance: "naive-control",
    cost_confidence: "deterministic-surrogate",
    project(event) {
      const key = normalizeWS(event.raw); // catches exact + whitespace-only dups; blind to semantics
      return { fingerprint: `cc-${h(key)}`, bytes: key };
    },
  },
  {
    id: "no-memo-reactor",
    provenance: "no-memo-simulation",
    cost_confidence: "deterministic-surrogate",
    forceAll: true, // degenerate always-moved canonicalizer (the ablation)
    project(event, tick) {
      // Degenerate always-moved canonicalizer (nonce) — isolates the memo skip.
      const nonce = `${tick}-${event.churn_seed}`;
      return { fingerprint: `nomemo-${nonce}`, bytes: `${materialProjection(event.fact)}::${nonce}` };
    },
  },
  {
    id: "byte-diff",
    provenance: "naive-control",
    cost_confidence: "deterministic-surrogate",
    project(event) {
      // Memo on whole raw bytes: cosmetic re-wording falsely propagates.
      return { fingerprint: `bd-${h(event.raw)}`, bytes: event.raw };
    },
  },
  {
    id: "react-loop",
    provenance: "naive-control",
    cost_confidence: "deterministic-surrogate",
    forceAll: true, // wall-clock heartbeat: re-runs every tick regardless of content
    project(event, tick) {
      // A flat, lambda-independent anchor. Coincides with oracle-cron on cost in
      // this offline model (both re-derive every tick); reported as such, not as
      // an independent win.
      return { fingerprint: `heartbeat-${tick}`, bytes: `${materialProjection(event.fact)}::beat${tick}` };
    },
  },
];

const CONTESTANT_IDS = CONTESTANTS.map((c) => c.id);

module.exports = { CONTESTANTS, CONTESTANT_IDS, normalizeWS };
