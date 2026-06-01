# Reactor Eval Harness

The test runner for the OpenProse Reactor example library. It turns a committed
example run (its `replay/` state-dir: receipts + world-models + topology) into a
runtime-independent **EvalTrajectory**, applies a **deterministic checker** (no
LLM), optionally runs a **key-gated LLM judge panel**, and writes an
**EvalReport** (Markdown). Implements the spec
`planning/plans/2026-05-28-intelligent-react/tests/reactor-eval-harness.md` and
plan §5 of `planning/plans/2026-06-01-example-library/plan.md`.

## Design at a glance

```
state-dir ──► Trajectory Normalizer ──► Deterministic Checker (NO LLM, caps grade)
                     │                            │
                     │                            ├──► Judge Panel (LLM, key-gated, OFF by default)
                     │                            │         └─ program_semantics / trajectory_quality /
                     │                            │            artifact_usefulness / safety_privacy /
                     │                            │            launch_demo  + Judge Consistency note
                     └──────────────► Verdict Adjudicator ──► EvalReport (markdown)
```

- **No runtime re-implementation.** The normalizer drives the shipped DevTools
  data layer (`@openprose/reactor-devtools/data` → `openStateDir` +
  `buildSnapshot`), which itself shapes the SDK's `createReplaySession`. The
  trajectory IS the view the DevTools replay viewer renders, so checks and judges
  share one canonical object.
- **Zero install, zero shared-config edit.** This directory is intentionally NOT
  a pnpm workspace member. `resolve.mjs` reaches the built `@openprose/*` packages
  via `createRequire` rooted at `packages/reactor-devtools/package.json` (a
  workspace member that already depends on `@openprose/reactor`). Plain
  `node --test`, no build step.
- **Deterministic blockers cap the grade.** A missing top-level artifact, a
  receipt that doesn't cite its changed upstream input, an unchanged replay that
  didn't skip, a same-epoch cycle, a leaked/blocked-but-passing run, or a broken
  chain-verify → auto-**F**, regardless of judge scores.

## Files

| File | Role |
|---|---|
| `resolve.mjs` | bridge to built `@openprose/*` packages + key gate; the only env/key surface |
| `normalizer.mjs` | Trajectory Normalizer → `EvalTrajectory` (render/skip/commit/wake events, costs, artifact hashes, `trajectoryHash`) |
| `deterministic-checker.mjs` | the 7 deterministic checks (NO LLM); blockers cap the grade |
| `scenarios.mjs` | the 5 scenarios: `cold_start` / `changed_input` / `no_change_replay` / `blocked_or_gated` / `artifact_review` |
| `judge-panel.mjs` | 5-judge LLM panel + Judge Consistency note (key-gated, OFF by default) |
| `adjudicator.mjs` | Verdict Adjudicator (folds deterministic + judges + cost-vs-baseline) |
| `report.mjs` | EvalReport model + Markdown writer (timing-free content hash) |
| `index.mjs` | `runEval()` / `evaluateExample()` orchestration |
| `cli.mjs` | integrator entry point |
| `eval-harness.test.mjs` | deterministic offline smoke (`node --test`) |

## Run

Deterministic, offline, zero spend (the smoke):

```bash
REACTOR_OFFLINE=1 node --test tools/eval-harness/eval-harness.test.mjs
```

CLI against the shipped devtools fixtures (default examples; deterministic-only
because `REACTOR_OFFLINE=1` forces the judge path off):

```bash
REACTOR_OFFLINE=1 node tools/eval-harness/cli.mjs --out reports/eval-report.md
# or a subset / custom example:
REACTOR_OFFLINE=1 node tools/eval-harness/cli.mjs \
  --example masked-relay=packages/reactor-devtools/fixtures/masked-relay \
  --scenarios cold_start,no_change_replay,blocked_or_gated
```

## Key gating (LLM judges)

The judge path is **OFF by default**. It turns on ONLY when an OpenRouter key is
resolvable **and** `REACTOR_OFFLINE` is unset. The key is read exclusively
through the shipped provider helpers (`hasOpenRouterKey` /
`createOpenRouterProvider` from `@openprose/reactor/adapters/agent-render`),
pointed at `/Users/sl/code/openprose/.env` by default (override with `--env` or
`REACTOR_ENV_PATH`). The key value is never printed or committed.

| Condition | Judge panel |
|---|---|
| `REACTOR_OFFLINE=1` | OFF — all 5 judges passing-skipped, no network (hermetic even with a key on disk) |
| no resolvable key | OFF — passing-skipped |
| key resolvable + offline unset | ON — live judges, evidence-cited |

The "reliability" rubric IS the example responsibility's `### Maintains`
postconditions (pass `maintainsPostconditions`); "performance" is `total.fresh`
from the replay cost rollup vs a committed `baselineRollup`.

## Proposed integrator wiring (do not let CI dial out)

The smoke is already a standalone `node --test` file with no install step, so the
lowest-friction wiring adds one script to the **root** `package.json` (integrator
to apply — this harness does not edit shared config):

```jsonc
// package.json  "scripts"
"test:eval:offline": "REACTOR_OFFLINE=1 node --test tools/eval-harness/eval-harness.test.mjs"
```

Chain it into the existing offline gate so it runs hermetically alongside the
reactor offline suite:

```jsonc
"test:reactor:offline": "… && REACTOR_OFFLINE=1 node --test tools/eval-harness/eval-harness.test.mjs"
```

Notes for the integrator:

- Keep the gate under `REACTOR_OFFLINE=1`. The judge path stays off; tiers 1–2
  run green at zero spend; nothing touches the network.
- The harness resolves `@openprose/*` from the **built** `dist/` of
  `packages/reactor` + `packages/reactor-devtools`, so `pnpm build` (or at least
  those two packages' builds) must precede the eval gate — same precondition the
  devtools `test:runtime` already has.
- A nightly/on-demand live job may run `node tools/eval-harness/cli.mjs` with a
  key present and `REACTOR_OFFLINE` unset to exercise the judge panel.
- The exit code is non-zero when any scenario fails, so the CLI is CI-safe as a
  standalone step too.
