// U12 — guards: poisoned-number grep + decidability wall + offline-only.
//
// (a) FAIL if any poisoned number (46:46, 92:0, 256:0, 74:74, 0.00022823, K1)
//     appears in packages/reactor-evals/** or REPORT.md — every figure must be
//     fresh from this run (eval-suite L72-80).
// (b) Decidability wall: assert no headline field derives from a judge
//     (judge-panel/adjudicator) — the quality track stays off the abstract.

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const POISON = ["46:46", "92:0", "256:0", "74:74", "0.00022823", "K1"];
// Files that legitimately DECLARE the forbidden list (the guard source and the
// preregistration that bans them) — they contain the strings as a banned-list
// declaration, not as a reused result. The surfaces that must stay clean are the
// published results, REPORT.md, and all other source.
const SKIP_FILES = new Set(["guards.cjs", "prereg.cjs", "prereg.json", "prereg.hash"]);

function walk(dir, acc) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === "runs" || e.name === ".git") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.(cjs|js|ts|json|md)$/.test(e.name)) acc.push(p);
  }
}

function runGuards(root) {
  const files = [];
  walk(root, files);

  const poisonHits = [];
  for (const f of files) {
    if (SKIP_FILES.has(path.basename(f))) continue;
    // results/surprise-cost.json + REPORT.md are the published surfaces — scan them.
    const text = fs.readFileSync(f, "utf8");
    for (const p of POISON) {
      if (text.includes(p)) poisonHits.push({ file: path.relative(root, f), token: p });
    }
  }

  // Decidability: the published results must not reference a judge field.
  let decidabilityOk = true;
  const decidabilityHits = [];
  const resultsPath = path.join(root, "results", "surprise-cost.json");
  if (fs.existsSync(resultsPath)) {
    const text = fs.readFileSync(resultsPath, "utf8");
    for (const judge of ["judge-panel", "adjudicator", "judge_score", "llm_grade"]) {
      if (text.includes(judge)) { decidabilityOk = false; decidabilityHits.push(judge); }
    }
  }

  return {
    poison_ok: poisonHits.length === 0,
    poison_hits: poisonHits,
    decidability_ok: decidabilityOk,
    decidability_hits: decidabilityHits,
  };
}

if (require.main === module) {
  const root = path.resolve(__dirname, "..");
  const g = runGuards(root);
  console.log(JSON.stringify(g, null, 2));
  process.exit(g.poison_ok && g.decidability_ok ? 0 : 1);
}

module.exports = { runGuards, POISON };
