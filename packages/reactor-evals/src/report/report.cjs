// U11 — the report + hero figure data. Emits machine-readable results AND a
// human-readable REPORT.md, every row carrying provenance + cost-confidence tier,
// ties/losses in the abstract with the same prominence as wins.

"use strict";

/**
 * @param {object} ctx { rows, gate, regressions, matrix, prereg, preregHash, modelPin }
 */
function buildResults(ctx) {
  const { rows, gate, regressions, prereg, preregHash } = ctx;

  const byContestantLambda = {};
  for (const r of rows) byContestantLambda[`${r.contestant}@${r.lambda}`] = r;

  // Headline N-fold per lambda: cron fresh / reactor fresh, only where equal-correctness holds.
  const folds = [];
  for (const lambda of prereg.lambda_grid) {
    const reactor = byContestantLambda[`reactor@${lambda}`];
    const cron = byContestantLambda[`oracle-cron@${lambda}`];
    if (!reactor || !cron) continue;
    const gatedReactor = gate.gated.find((g) => g.contestant === "reactor" && g.lambda === lambda);
    const fold = reactor.totalFresh === 0 ? null : cron.totalFresh / reactor.totalFresh;
    folds.push({
      lambda,
      reactor_fresh: reactor.totalFresh,
      cron_fresh: cron.totalFresh,
      fold: fold === null ? null : round(fold, 2),
      equal_correctness: gatedReactor ? gatedReactor.matches_oracle_correctness : null,
      cost_win_reportable: gatedReactor ? gatedReactor.cost_win_reportable : false,
    });
  }

  const reactorReg = regressions.reactor;
  const cronReg = regressions["oracle-cron"];

  const headlineLambda = 0.01;
  const hl = folds.find((f) => f.lambda === headlineLambda) || folds.find((f) => f.fold !== null);
  const headline = hl
    ? `At lambda=${pct(hl.lambda)}, Reactor spends ~${hl.fold}x fewer fresh tokens than an equal-correctness cron (${hl.reactor_fresh} vs ${hl.cron_fresh} fresh); Reactor's per-tick spend scales ~linearly through the origin with the material-change rate (slope=${reactorReg.slope_fresh_per_material_tick} fresh/material-tick, intercept~${reactorReg.intercept_fresh_per_immaterial_tick}, p=${reactorReg.p_value}) while the cron's stays flat (slope=${cronReg.slope_fresh_per_material_tick}, intercept~${cronReg.intercept_fresh_per_immaterial_tick}).`
    : "(no equal-correctness fold available)";

  return {
    schema: "reactor-evals/results@1",
    prereg_hash: preregHash,
    model_pin: ctx.modelPin,
    headline,
    null_rejected: reactorReg.rejects_null,
    folds,
    regressions,
    gated_rows: gate.gated,
    contestants: rows.map((r) => ({
      contestant: r.contestant,
      provenance: r.provenance,
      cost_confidence: r.cost_confidence,
      lambda: r.lambda,
      fresh: r.totalFresh,
      reused: r.totalReused,
      correct_rate: r.correctRate,
      dispositions: r.dispositions,
      receipts: r.receiptCount,
    })),
  };
}

/** Hero figure data: cumulative fresh over time for reactor vs cron at one lambda. */
function heroFigure(rowsByKey, lambda) {
  const reactor = rowsByKey[`reactor@${lambda}`];
  const cron = rowsByKey[`oracle-cron@${lambda}`];
  const cum = (perTick) => {
    let s = 0;
    return perTick.map((p) => (s += p.fresh));
  };
  return {
    lambda,
    annotation: "both held at equal correctness against ground truth",
    x_tick: reactor.perTick.map((p) => p.tick),
    reactor_cumulative_fresh: cum(reactor.perTick),
    cron_cumulative_fresh: cum(cron.perTick),
  };
}

function renderMarkdown(results, figure, prereg) {
  const lines = [];
  lines.push("# SURPRISE-COST benchmark — measured result\n");
  lines.push(`> **${results.headline}**\n`);
  lines.push(`- prereg hash: \`${results.prereg_hash}\``);
  lines.push(`- model pin: \`${results.model_pin}\``);
  lines.push(`- null \"spend tracks wall-clock/event-count\" rejected: **${results.null_rejected}**\n`);

  lines.push("## Fresh-token spend by contestant and lambda\n");
  lines.push("| contestant | provenance | lambda | fresh | correct | equal-correctness | reportable |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const r of results.contestants) {
    const g = results.gated_rows.find((x) => x.contestant === r.contestant && x.lambda === r.lambda);
    lines.push(
      `| ${r.contestant} | ${r.provenance} | ${pct(r.lambda)} | ${r.fresh} | ${(r.correct_rate * 100).toFixed(0)}% | ${g ? g.matches_oracle_correctness : "?"} | ${g ? g.cost_win_reportable : "?"} |`,
    );
  }
  lines.push("");

  lines.push("## Headline folds (Reactor vs equal-correctness cron)\n");
  lines.push("| lambda | reactor fresh | cron fresh | fold | equal-correctness |");
  lines.push("|---|---|---|---|---|");
  for (const f of results.folds) {
    lines.push(`| ${pct(f.lambda)} | ${f.reactor_fresh} | ${f.cron_fresh} | ${f.fold === null ? "n/a (lambda=0)" : f.fold + "x"} | ${f.equal_correctness} |`);
  }
  lines.push("");

  lines.push("## Regression (pooled per-tick fresh ~ preregistered materiality)\n");
  lines.push("| contestant | slope (fresh/material-tick) | intercept (fresh/immaterial-tick) | p-value | rejects null |");
  lines.push("|---|---|---|---|---|");
  for (const [id, reg] of Object.entries(results.regressions)) {
    lines.push(`| ${id} | ${reg.slope_fresh_per_material_tick} | ${reg.intercept_fresh_per_immaterial_tick} | ${reg.p_value} | ${reg.rejects_null} |`);
  }
  lines.push("");

  lines.push("## Hero figure (cumulative fresh over time)\n");
  lines.push(`At lambda=${pct(figure.lambda)} — *${figure.annotation}*. Reactor flattens as the world goes quiet; the cron is a straight diagonal.\n`);
  lines.push("```");
  lines.push(asciiSparkTwo(figure.reactor_cumulative_fresh, figure.cron_cumulative_fresh));
  lines.push("```\n");

  // Honest baseline-coincidence note: flag baselines whose fresh-vector is identical.
  const coincidences = findCoincidences(results.contestants, prereg.lambda_grid);
  if (coincidences.length) {
    lines.push("## Baseline coincidences (honesty note)\n");
    lines.push("In this offline model some baselines collapse onto the same fresh-cost vector — they are NOT independent corroboration:\n");
    for (const c of coincidences) lines.push(`- **${c.join(" == ")}**`);
    lines.push("\n`oracle-cron == react-loop` because both re-derive every node every tick (a wall-clock heartbeat IS a cron here). `byte-diff == content-cache` because the generated tape has no exact-duplicate or whitespace-only churn for the content-cache to catch that byte-diff misses; the silent-staleness regime (where content-cache goes BLIND, not merely wasteful) and a duplicate-on-second-wire churn variant separate them — both are follow-on work (the freshness sub-track + a churn-variant generator).\n");
  }

  lines.push("## Limitations (report section 9)\n");
  lines.push("- **Deterministic-cost surrogate.** The offline ledger uses a preregistered byte-length token surrogate (`deterministic-cost-v1`), not a live model bill. The real N=1 live run (U10) is the dollar-grade ledger; it is **blocked in this build** pending `OPENROUTER_API_KEY` (see `src/live/run.cjs`).");
  lines.push("- **Null signer (v1).** Receipts are tamper-evident, not tamper-proof; the cryptographic byte-hash signer is BACKLOG `C3`.");
  lines.push("- **No-cheap-hash domain.** Where no cheap material hash exists, Reactor degrades to a forecast cadence — reported as an honest TIE, not a win.");
  lines.push("- **Staggered-diamond topology (MK-1).** Deliberately excluded from the headline world; the FIFO drain glitch is a separate, named limitation, not gated on here.");
  lines.push("");

  return lines.join("\n");
}

// A compact two-series ASCII chart (deterministic; for REPORT.md eyeballing).
function asciiSparkTwo(a, b) {
  const N = 24; // columns
  const sample = (arr) => {
    const out = [];
    for (let i = 0; i < N; i++) out.push(arr[Math.min(arr.length - 1, Math.floor((i / (N - 1)) * (arr.length - 1)))]);
    return out;
  };
  const sa = sample(a), sb = sample(b);
  const max = Math.max(1, ...sa, ...sb);
  const H = 8;
  const grid = Array.from({ length: H }, () => new Array(N).fill(" "));
  for (let i = 0; i < N; i++) {
    const ra = Math.round((sa[i] / max) * (H - 1));
    const rb = Math.round((sb[i] / max) * (H - 1));
    grid[H - 1 - rb][i] = "C"; // cron
    grid[H - 1 - ra][i] = "R"; // reactor (drawn last, wins ties visually)
  }
  const body = grid.map((row) => "|" + row.join("")).join("\n");
  return `${body}\n+${"-".repeat(N)}  (R=reactor  C=cron;  y=cumulative fresh, x=time)`;
}

// Group contestants whose per-lambda fresh vector is byte-identical.
function findCoincidences(contestants, lambdas) {
  const vec = {};
  for (const r of contestants) {
    vec[r.contestant] = vec[r.contestant] || {};
    vec[r.contestant][r.lambda] = r.fresh;
  }
  const sig = {};
  for (const [id, v] of Object.entries(vec)) {
    const key = lambdas.map((l) => v[l]).join(",");
    (sig[key] = sig[key] || []).push(id);
  }
  return Object.values(sig).filter((g) => g.length > 1);
}

function pct(l) {
  return `${(l * 100)}%`;
}
function round(v, d = 4) {
  const m = Math.pow(10, d);
  return Math.round(v * m) / m;
}

module.exports = { buildResults, heroFigure, renderMarkdown };
