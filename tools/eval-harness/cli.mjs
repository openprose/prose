#!/usr/bin/env node
// cli.mjs — the integrator-wireable entry point.
//
// Usage:
//   node tools/eval-harness/cli.mjs \
//     --example masked-relay=packages/reactor-devtools/fixtures/masked-relay \
//     [--example NAME=PATH ...] \
//     [--scenarios cold_start,no_change_replay,...] \
//     [--out reports/eval-report.md] \
//     [--env /Users/sl/code/openprose/.env]
//
// Defaults to the shipped devtools fixtures when no --example is given, so a
// keyless `node tools/eval-harness/cli.mjs` is a self-contained offline smoke.
// The LLM judge path is OFF unless an OpenRouter key is resolvable AND
// REACTOR_OFFLINE is unset. The key value is NEVER printed.

import { join } from "node:path";

import { runEval, judgesEnabled } from "./index.mjs";
import { renderMarkdown, writeReport } from "./report.mjs";
import { REPO_ROOT, DEFAULT_ENV_PATH } from "./resolve.mjs";

function parseArgs(argv) {
  const out = { examples: [], scenarios: undefined, out: undefined, env: DEFAULT_ENV_PATH };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--example") {
      const v = argv[++i] ?? "";
      const eq = v.indexOf("=");
      if (eq > 0) {
        out.examples.push({ exampleId: v.slice(0, eq), stateDir: v.slice(eq + 1) });
      }
    } else if (a === "--scenarios") {
      out.scenarios = (argv[++i] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    } else if (a === "--out") {
      out.out = argv[++i];
    } else if (a === "--env") {
      out.env = argv[++i];
    } else if (a === "--help" || a === "-h") {
      out.help = true;
    }
  }
  return out;
}

function defaultExamples() {
  const fx = (n) => join(REPO_ROOT, "packages", "reactor-devtools", "fixtures", n);
  // The shipped fixtures with topology + receipts. monorepo-ci / inbox-triage
  // carry a `failed` receipt → exercise blocked_or_gated.
  return [
    { exampleId: "masked-relay", stateDir: fx("masked-relay") },
    { exampleId: "contract-redline", stateDir: fx("contract-redline") },
    { exampleId: "monorepo-ci", stateDir: fx("monorepo-ci") },
  ];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(
      "reactor-eval-harness — deterministic-first eval over committed replay state-dirs\n" +
        "  --example NAME=PATH   add an example (repeatable)\n" +
        "  --scenarios a,b,c     restrict scenario kinds\n" +
        "  --out PATH            write the markdown report\n" +
        "  --env PATH            .env to read the OpenRouter key from (judges, key-gated)\n",
    );
    return 0;
  }

  const examples = (args.examples.length ? args.examples : defaultExamples()).map(
    (e) => ({ ...e, scenarios: args.scenarios }),
  );

  const on = judgesEnabled(args.env);
  process.stderr.write(
    `[eval-harness] LLM judges: ${on ? "ON (key resolved)" : "OFF (no key / REACTOR_OFFLINE) — deterministic-only"}\n`,
  );

  const { report } = await runEval({
    harnessBuildId: process.env["EVAL_HARNESS_BUILD_ID"] ?? "local",
    examples,
    envPath: args.env,
  });

  if (args.out) {
    const written = writeReport(report, args.out);
    process.stderr.write(`[eval-harness] wrote ${written.path} (${written.contentHash})\n`);
  } else {
    process.stdout.write(renderMarkdown(report));
  }

  // Exit non-zero if any scenario failed (CI-safe signal).
  return report.summary.failed > 0 ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    process.stderr.write(`[eval-harness] fatal: ${err?.stack ?? err}\n`);
    process.exit(2);
  });
