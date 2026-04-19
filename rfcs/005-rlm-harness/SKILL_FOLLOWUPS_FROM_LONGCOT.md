# Skill followups from LongCoT iteration

Scratchpad of skill-level (not program-level) changes I'd propose while
iterating on the `longcot-solver` program against the LongCoT benchmark.
Growing as iteration proceeds. Each entry is scoped to the *skill* or
the *binary* — things the program cannot fix by itself.

## 1. Plumb `RLMIFY_THINKING` (or equivalent) through to pi

**Where**: `skills/rlmify/bin/src/lib/pi.ts:28`, also the two call sites in
`cmd/run.ts` and `cmd/spawn.ts`.

**Observed**: `pi.ts` hardcodes `thinking: opts.thinking ?? "low"`. Neither
`run.ts` nor `spawn.ts` sets `opts.thinking`, so every pi child runs at
`--thinking low` regardless of caller intent. The LongCoT paper's baseline
uses "highest setting if available" — meaningful accuracy experiments cannot
match paper conditions until this is unblocked. Also relevant: the smoke run
on Haiku 4.5 drifted to prose (no `emit-delta`) on the one complex problem
in the slice; `thinking=low` was a plausible contributor (long-horizon
problems benefit from more reasoning budget even at small-model scale).

**Proposed change**: 

```ts
// pi.ts
const thinking = opts.thinking ?? process.env.RLMIFY_THINKING ?? "low";
```

Propagation from `run.ts` / `spawn.ts` is optional — env-var-only keeps the
change surface-minimal. Callers (including our shim + `run.sh` scripts) can
set `RLMIFY_THINKING=high` and have it flow to every pi subprocess in the
tree.

**Why not a CLI flag instead**: Env var propagates naturally through recursion
(children inherit parent's env); a CLI flag would need explicit forwarding in
spawn. Env var is also the existing pattern for `RLMIFY_MODEL`, `RLMIFY_SKILL`,
`RLMIFY_PROGRAMS`, `RLMIFY_LOG_DIR`, `RLMIFY_LAYER`, `RLMIFY_CHILD_REGISTRY`.

**Status**: Not implemented. Tracked here; hoping to validate via paper-match
runs once unblocked.

## 2. Spawned delegation is opt-in by the LLM, not guaranteed

**Observed** (Iter 3 of longcot-solver, run `24616697612`): the program body
had an explicit Phase 6 saying "delegate one fresh-eyes verify pass via
`rlmify spawn verify_solution`". On 3 questions with Opus 4.7, verify
actually ran on only 1 of 3 (question `89`). On the other two, the model
skipped the phase entirely despite imperative wording. On the one question
where it did spawn, it spawned twice — the second spawn had a different
suffix, so it was a distinct pi child rather than a retry of the same call.

**Why this is skill-relevant**: the skill is program-agnostic, so the skill
itself cannot force a spawn. But it could offer a primitive that *mandates*
specific delegations as part of the HUD contract, and the binary could lint
the session to confirm the expected spawn actually happened (and re-invoke
if missing). Analogous to how `emit-delta` already has a session fallback
for drift.

**Proposed change**: optional `<required_spawns>` section in the HUD spec
listing program names that MUST be invoked. `rlmify run` would then, on
receiving the final delta, check `session.jsonl` for those spawn calls; if
missing, it could (a) error out, (b) auto-insert them before emitting, or
(c) warn only. Start with (c).

**Status**: not implemented. Iter 4 of longcot-solver just removed the
verify delegation instead, because at same model / same thinking=low the
verifier was producing incorrect critiques (see finding 3 below) — so the
value of enforcing it was unclear.

## 3. Same-model / same-settings verifier is not a useful second opinion

**Observed**: On question `89` where verify did spawn, the verifier was
Opus 4.7 at `thinking=low` — identical to the solver. It returned
`verdict: fail` with a critique that itself contained hallucinated math
(claimed node_14 should be `5` when the correct answer, which Opus's
original draft already had, was `9`). If the solver had obeyed the critique,
it would have degraded a correct answer into a wrong one.

**Why this is skill-relevant**: v1's `rlmify spawn` can only target
"whatever model the parent is running as" (via inherited `RLMIFY_MODEL`).
For verification to actually help, the verifier needs to be either
(a) a different / stronger model, (b) the same model at higher thinking
budget, or (c) grounded in tooling (a symbolic checker, execution, etc.).
None of those are expressible today. Spawning a same-same child just
produces a correlated second draft, not an independent check.

**Proposed changes**:
- Per-spawn `--model` override in `rlmify spawn` (would read through to
  `invokePi`'s `opts.model`). Pair with a child env var `RLMIFY_MODEL` so
  the child sees the swap cleanly.
- Per-spawn `--thinking` override following the same pattern once finding
  #1 is in.
- Documented pattern in `delegation.md`: "verify passes should use either
  stronger model or higher thinking budget; same-same verify is anti-value
  on reasoning-heavy tasks."

**Status**: not implemented.

## 4. Fan-out with same-model drafts: good for format disambiguation, blind to correlated error

**Observed** (Iter 5 of longcot-solver, run `24616915796`): introduced a
`draft_solution` leaf and had `solve_longcot_problem` fan out to three
parallel drafts, then synthesize (majority / per-part reconcile).

Two instructive cases from the same run:

- **DistMem_easy_22** — drafts `a` and `b` both produced a long
  `A1=16; A2=15; ...; A13=31` string; draft `c` produced `[15, 13840, 31]`
  (the correct format). Opus-the-synthesizer correctly recognized that
  a/b violated the problem's stated answer format and committed `c`.
  Consensus-on-format added real value: without fan-out, a single draft
  could easily have emitted the over-verbose answer and scored zero.

- **HM_easy_26** — drafts `a` and `b` both independently produced
  `q1=Bool, q2=Nat, q3=(Nat × Bool)`; draft `c` gave up partway. The
  majority was confidently wrong in the same way both times. The
  grader still scored incorrect. Consensus cannot escape correlated
  bias — when two independent reasoning passes through the same model
  at the same settings hit the same misstep, their agreement is not
  evidence of correctness, only of the bias's stability.

**Why this is skill-relevant**: `rlmify spawn` today gives you
"multiple instances of the same model at the same thinking level."
That's good for sampling variance (the DistMem case) but useless for
systematic error (the HM case). The improvements proposed under
findings #1 and #3 (per-spawn `--thinking` and `--model` overrides)
directly address this: a fan-out becomes meaningfully more valuable
if at least one draft is run at higher thinking, or with a different
base model, than the solver.

**Status**: not implemented. Both required changes are blocked on #1
and #3.

## Accuracy progression across five LongCoT-solver iterations

All runs: Opus 4.7 via rlmified pi, `thinking=low` (hardcoded), 
LongCoT-mini, seed=0, max_questions=3 → same three problems every time
(`DistMem_easy_22`, `HM_easy_26`, `89`).

| Iter | Change | correct | wall time on hardest (Q 89) |
|---|---|---|---|
| 1 | baseline depth-0 program | 2/3 (HM: refused) | 141s |
| 2 | + 5-phase metacognitive scaffold + anti-refusal | 2/3 (HM: best-effort, wrong) | 119s |
| 3 | + `verify_solution` delegation | 2/3 | 283s |
| 4 | — verify, + procedure-based self-check | 2/3 | 159s |
| 5 | — self-solve, + 3-draft fan-out + synthesize | 2/3 | 176s |

The one failing question is the same across every iteration. `HM_easy_26`
is Hindley-Milner type inference with 348 let-bindings; all non-trivial
state-tracking within Opus's thinking=low budget converges on the same
wrong answer. The plateau is at the harness level, not the program
level — the remaining work is the three findings above.

