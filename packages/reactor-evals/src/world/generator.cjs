// U2 (b) — the lambda-tunable, seeded event generator + ground-truth labels.
//
// Per tick: draw Bernoulli(lambda). On a HIT, the chosen entity's material fact
// changes (a genuine surprise); on a MISS, the same fact arrives again wrapped in
// fresh immaterial churn (the "messy" no-op: re-wording, timestamp bump,
// duplicate-on-second-wire). NO Math.random / Date.now — a mulberry32 PRNG seeded
// per (lambda, seed) so the tape is byte-stable and replayable (world-gen note
// 4.1.2). The label is derived from the material projection, never from the raw
// bytes the contestants see.

"use strict";

const { materialFact, materialProjection, rawBytes, eventLabel } = require("./material.cjs");

/** mulberry32: a tiny deterministic PRNG. Pure, seedable, no global state. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generate one lambda cell: a tape of `ticks` events over `entities` entities.
 * Returns { lambda, ticks, events, labels } where each event carries the raw
 * messy bytes a contestant sees and each label carries the material ground truth.
 *
 * @param {{ lambda: number, ticks: number, entities: number, seed: number }} cfg
 */
function generateCell(cfg) {
  const { lambda, ticks, entities, seed } = cfg;
  // Seed deterministically from (seed, lambda) so each cell is independent yet stable.
  const rnd = mulberry32((seed ^ Math.round(lambda * 1e6)) >>> 0);

  // The current material value per entity (an integer that ticks up on a material change).
  const current = new Array(entities).fill(0);
  // Track the previous material projection per entity to label "materially_changed".
  const prevProjection = new Array(entities).fill(null);

  const events = [];
  const labels = [];
  let churn = 0;

  for (let t = 0; t < ticks; t++) {
    const entity = Math.floor(rnd() * entities); // which entity this tick concerns
    const hit = rnd() < lambda; // Bernoulli(lambda): a material change?
    if (hit) current[entity] += 1; // the material fact moves

    const fact = materialFact(`E${entity}`, current[entity]);
    const proj = materialProjection(fact);
    const materially = prevProjection[entity] !== proj;
    prevProjection[entity] = proj;

    churn += 1; // every tick rotates the cosmetic form (even a miss is messy)
    events.push({
      tick: t,
      entity: fact.entity,
      fact,
      raw: rawBytes(fact, churn),
      churn_seed: churn,
    });
    labels.push(eventLabel(t, fact, materially, churn));
  }

  const materialCount = labels.filter((l) => l.materially_changed).length;
  return Object.freeze({ lambda, ticks, entities, seed, events, labels, materialCount });
}

module.exports = { generateCell, mulberry32 };
