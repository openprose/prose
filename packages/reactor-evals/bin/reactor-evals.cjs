#!/usr/bin/env node
// The suite entry: generate -> preregister (hash BEFORE any run) -> sweep ->
// score -> equal-correctness gate -> matrix -> report + hero figure -> guards.
// Offline & deterministic; reproducible from the frozen ledgers with zero network.

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { generateCell } = require("../src/world/generator.cjs");
const { CONTESTANTS } = require("../src/baselines/contestants.cjs");
const { buildPrereg, hashPrereg } = require("../src/prereg/prereg.cjs");
const { sweep, runContestant } = require("../src/run/sweep.cjs");
const { surpriseCostRegression, propagation, amortization, gateCommit, verifyChainPerNode } = require("../src/score/scorers.cjs");
const { equalCorrectnessGate } = require("../src/score/frontier.cjs");
const { validateMatrix, REGIME_COMPARATORS } = require("../src/report/matrix.cjs");
const { buildResults, heroFigure, renderMarkdown } = require("../src/report/report.cjs");
const { runInvariants } = require("../src/invariants/invariants.cjs");
const { runGuards } = require("../tools/guards.cjs");
const { runLiveN1 } = require("../src/live/run.cjs");

const CFG = {
  ticks: 1000,
  entities: 1,
  nDependents: 3,
  seed: 0xC057,
  lambdas: [0, 0.01, 0.1, 0.5, 1.0],
  modelPin: "openrouter:openai/gpt-5.4-mini (live cell only; offline uses deterministic-cost-v1)",
};

function main() {
  const root = path.resolve(__dirname, "..");
  const outDir = path.join(root, "results");
  const runsDir = path.join(root, "runs");
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(runsDir, { recursive: true });

  // 1. Generate the cells (deterministic).
  const cells = CFG.lambdas.map((lambda) => generateCell({ lambda, ticks: CFG.ticks, entities: CFG.entities, seed: CFG.seed }));

  // 2. PREREGISTER + hash BEFORE any ledger write.
  const prereg = buildPrereg(cells, CONTESTANTS, CFG);
  const preregHash = hashPrereg(prereg);
  fs.writeFileSync(path.join(outDir, "prereg.json"), JSON.stringify(prereg, null, 2));
  fs.writeFileSync(path.join(outDir, "prereg.hash"), preregHash + "\n");
  console.log(`[prereg] hash=${preregHash} (committed before any run)`);

  // 3. SWEEP — one committed ledger directory per (contestant x lambda).
  const dirFor = (id, lambda) => path.join(runsDir, `${id}__lambda-${lambda}`);
  const rows = sweep(CONTESTANTS, cells, { nDependents: CFG.nDependents, dirFor });
  const rowsByKey = {};
  for (const r of rows) rowsByKey[`${r.contestant}@${r.lambda}`] = r;

  // 4. SCORE — regression per contestant at the headline lambda; propagation/amortization/gateCommit.
  const HEAD = 0.01;
  const labelsAt = (lambda) => prereg.labels[String(lambda)];
  const regressions = {};
  for (const c of CONTESTANTS) {
    const row = rowsByKey[`${c.id}@${HEAD}`];
    regressions[c.id] = surpriseCostRegression(row.perTick, labelsAt(HEAD));
  }
  const reactorHead = rowsByKey[`reactor@${HEAD}`];
  const prop = propagation(reactorHead.perTick, labelsAt(HEAD));
  const amort = amortization(reactorHead, CFG.nDependents);

  // gateCommit predicate over the committed reactor ledger (no failed receipts expected).
  const gcReceipts = JSON.parse(fs.readFileSync(path.join(dirFor("reactor", HEAD), "receipts.json"), "utf8"));
  const gc = gateCommit(gcReceipts);

  // Chain-verifiability across EVERY committed cell (per-node hash chains).
  const chainBad = [];
  for (const c of CONTESTANTS) {
    for (const lambda of CFG.lambdas) {
      const rec = JSON.parse(fs.readFileSync(path.join(dirFor(c.id, lambda), "receipts.json"), "utf8"));
      const v = verifyChainPerNode(rec);
      if (!v.ok) chainBad.push({ cell: `${c.id}@${lambda}`, bad: v.bad });
    }
  }
  const chainOk = chainBad.length === 0;

  // 5. EQUAL-CORRECTNESS GATE + MATRIX.
  validateMatrix();
  const gate = equalCorrectnessGate(rows);

  // 6. REPORT + HERO FIGURE.
  const results = buildResults({ rows, gate, regressions, matrix: REGIME_COMPARATORS, prereg, preregHash, modelPin: CFG.modelPin });
  results.propagation = prop;
  results.amortization = amort;
  results.gatecommit = gc;
  results.chain_verified = { ok: chainOk, cells: CONTESTANTS.length * CFG.lambdas.length, bad: chainBad };
  results.invariants = runInvariants();
  results.live_n1 = runLiveN1();
  const figure = heroFigure(rowsByKey, 0.1);

  fs.writeFileSync(path.join(outDir, "surprise-cost.json"), JSON.stringify(results, null, 2));
  fs.writeFileSync(path.join(outDir, "hero-figure.json"), JSON.stringify(figure, null, 2));
  const md = renderMarkdown(results, figure, prereg);
  fs.writeFileSync(path.join(root, "REPORT.md"), md);

  // 7. GUARDS (poison-grep + decidability wall).
  const guard = runGuards(root);

  // Summary to stdout.
  console.log(`[headline] ${results.headline}`);
  console.log(`[null-rejected] ${results.null_rejected}`);
  console.log(`[propagation] precision=${prop.precision} recall=${prop.recall} exact=${prop.exact}`);
  console.log(`[gate] reportable reactor rows: ${gate.gated.filter((g) => g.contestant === "reactor" && g.cost_win_reportable).length}/${CFG.lambdas.length}`);
  console.log(`[invariants] #4=${results.invariants.implemented[0].ok} #5=${results.invariants.implemented[1].ok}`);
  console.log(`[live-n1] ${results.live_n1.status}: ${results.live_n1.reason || ""}`);
  console.log(`[chain] per-node chain-verified across all ${results.chain_verified.cells} cells: ${chainOk}`);
  console.log(`[guards] poison=${guard.poison_ok} decidability=${guard.decidability_ok}`);

  if (!results.null_rejected) { console.error("FAIL: null not rejected"); process.exit(1); }
  if (!prop.exact) { console.error("FAIL: propagation not exact"); process.exit(1); }
  if (!chainOk) { console.error("FAIL: chain verification: " + JSON.stringify(chainBad).slice(0, 300)); process.exit(1); }
  if (!guard.poison_ok || !guard.decidability_ok) { console.error("FAIL: guard violation"); process.exit(1); }
  console.log("OK — offline suite green; artifacts in results/, runs/, REPORT.md");
}

main();
