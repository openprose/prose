# @openprose/reactor-evals — the SURPRISE-COST benchmark

The FR-3 "the bet": the first **preregistered, falsifiable, equal-correctness-gated**
measurement that the Reactor harness's **fresh-token spend scales with surprise,
not time**. Built per `planning/plans/2026-06-07-surprise-cost-benchmark/PLAN.md`.

## Run it

```sh
# Build the SDK once (the suite drives the PUBLIC @openprose/reactor barrel):
pnpm --filter @openprose/reactor build
# Mint everything (deterministic, offline, zero network):
REACTOR_OFFLINE=1 node packages/reactor-evals/bin/reactor-evals.cjs
# Unit tests:
REACTOR_OFFLINE=1 node --test packages/reactor-evals/test/*.test.cjs
```

Outputs: `results/prereg.json` + `results/prereg.hash` (committed **before** any
run), `results/surprise-cost.json` (machine), `results/hero-figure.json`,
`REPORT.md` (human) — all **committed**. The full 30-cell `runs/` (87M of
ledgers) is **gitignored**: every offline cell is byte-deterministic from the
committed prereg + seed, so re-running the suite *is* replay (no re-derivation
drift — prereg hash + REPORT.md are byte-stable across runs). `runs-sample/`
commits the headline pair (`reactor` + `oracle-cron` at λ=1%) as the
**frozen, chain-verifiable replay demonstrator** — replay it to recover the
240-vs-41690-fresh fold with zero re-derivation. (The future **live N=1 ledger**,
U10, is the one trail that MUST be captured once and committed — it is nondeterministic
and is the dollar-grade headline; blocked here on the key.)

## The result this build mints

> At λ=1%, Reactor spends **~174× fewer fresh tokens** than an equal-correctness
> cron; the fold **decays** as the change-rate rises (≈1390× at λ=0 → 1.36× at
> λ=1.0 — no surprise, no saving). Reactor's per-tick spend regresses on the
> **preregistered** material-change indicator with slope ≈30 fresh/material-tick,
> intercept ≈0, permutation p≈1e-4; the cron is flat in surprise (slope≈0). The
> null "spend tracks wall-clock/event-count" is **rejected** for Reactor and
> **not** rejected for the cron — and every cost row is gated to equal
> correctness against the oracle trajectory.

## How it maps to the PLAN (unit status)

| Unit | What | Status |
|---|---|---|
| U1 | deterministic offline cost seam (`deterministic-cost-v1`, preregistered) | ✅ |
| U2 | λ world generator + material projection + labels + oracle | ✅ |
| U3 | λ-sweep driver (real reconciler, per-tick fresh off the receipts) | ✅ |
| U4 | six contestants (reactor / oracle-cron / content-cache / no-memo / byte-diff / react-loop) | ✅ |
| U5 | preregistration (labels + decision rule + model pin, hashed before any run) | ✅ |
| U6 | scorers: SURPRISE-COST regression + permutation test, propagation (#2), amortization (#9), gateCommit (#6), per-node chain-verify | ✅ |
| U7 | equal-correctness gate (refuses a cost-only row) + regime→comparator matrix | ✅ |
| U8 | long-horizon (#11) 7/30/90-day | ⏳ scaffolded — the sweep generalizes; lift `timeline-runner` is follow-on |
| U9 | offline invariants — #4 duplicate-idempotency, #5 crash-recovery | ✅ (#8/#12 scaffolded, need the compile surface) |
| U10 | real messy-feed **N=1 live run** + cost reconciliation | ⛔ **BLOCKED — no `OPENROUTER_API_KEY`** (see `src/live/run.cjs`); never fabricated |
| U11 | report + hero figure + suite CLI + replayability | ✅ |
| U12 | poison-number grep + decidability wall + offline-only | ✅ |

## Honest scope notes

- **`.cjs` not `.ts`.** The PLAN specifies a `.ts` / nodenext package. This build
  authors the runnable spine in CommonJS `.cjs` (EVALS.md's "most portable" form,
  since `@openprose/reactor` is `type: commonjs`) so it mints real artifacts under
  the worktree's available toolchain (no tsx/vitest linked). Module boundaries,
  public-SDK-only imports, and the unit layout match the PLAN 1:1; a `.ts` port is
  mechanical. The published package should depend on `@openprose/reactor`
  `workspace:^` (declared) and run after a `pnpm install` links it.
- **Deterministic surrogate, not a dollar bill.** The offline ledger uses the
  preregistered byte-length token surrogate. The dollar-grade headline is the
  **U10 live N=1 run** — blocked here on the key.
- **Baseline coincidences** are flagged in `REPORT.md` (cron≡react-loop;
  byte-diff≡content-cache on a tape with no exact-dup/whitespace-only churn) so
  the field is not misread as independent corroboration.
- **Decidability wall.** Every headline number is a deterministic predicate over
  `receipts.json`; no LLM grades anything. The key-gated judge track is not part
  of this build's abstract.
