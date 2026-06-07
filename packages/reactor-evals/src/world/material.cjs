// U2 (a) — the material projection + the messy-churn model + the event label.
//
// The benchmark world is the competitor-activity-monitor / news-desk archetype
// (spec/03-ReactorPattern.md:261-413): a feed of evidence about K entities, each
// item carrying a STRUCTURED material fact (the thing a maintained briefing is a
// function of) wrapped in MESSY immaterial churn (re-wording, re-ordering,
// timestamp bumps, duplicate-on-second-wire). The single anti-gaming invariant
// (baselines note; spec/03:424-426 "every re-poll looks changed"): the event
// LABEL `materially_changed` is derived from the SAME material projection the
// reactor contestant's canonicalizer keys on — re-wording can never be scored as
// a real change, and a real change can never hide behind stable prose.

"use strict";

const crypto = require("node:crypto");

/** The material fact an entity carries: a small structured record. */
function materialFact(entity, value) {
  return { entity, value };
}

/**
 * The MATERIAL PROJECTION: the canonical, churn-free string the maintained truth
 * is a function of. Order-insensitive over keys, value-exact. This is the single
 * function both the label generator (ground truth) and the `reactor` contestant's
 * fingerprint policy consume — they cannot disagree.
 */
function materialProjection(fact) {
  return JSON.stringify({ entity: fact.entity, value: fact.value });
}

/**
 * The MESSY RAW BYTES of one feed item: the material fact buried in immaterial
 * churn. `churnSeed` rotates the cosmetic form WITHOUT touching the projection,
 * so byte-diff/content-cache over-render while the material projection is stable.
 */
function rawBytes(fact, churnSeed) {
  const reword = CHURN_WORDS[churnSeed % CHURN_WORDS.length];
  const ts = 1700000000 + churnSeed * 37; // a moving poll-timestamp (immaterial)
  // Keys deliberately re-ordered and prose re-worded per churnSeed; the material
  // value is embedded verbatim but surrounded by noise.
  return JSON.stringify({
    received_at: ts,
    note: `${reword} update regarding ${fact.entity}`,
    seq: churnSeed,
    payload: { about: fact.entity, fact: fact.value, _filler: reword.repeat(3) },
  });
}

const CHURN_WORDS = ["breaking", "reported", "fresh", "incoming", "latest", "wire", "flash"];

/** sha256 hex of a string (the fingerprint primitive all policies share). */
function hash(s) {
  return crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);
}

/**
 * The event label (the propagation + equal-correctness ground truth).
 * @param {number} tick
 * @param {object} fact          the entity fact this tick delivers
 * @param {boolean} materially   whether the material projection moved vs prev tick
 * @param {number} churnSeed
 */
function eventLabel(tick, fact, materially, churnSeed) {
  return Object.freeze({
    tick,
    entity: fact.entity,
    material_projection: materialProjection(fact),
    materially_changed: materially,
    affected_facet: materially ? `entity:${fact.entity}` : null,
    churn_seed: churnSeed,
  });
}

module.exports = {
  materialFact,
  materialProjection,
  rawBytes,
  hash,
  eventLabel,
};
