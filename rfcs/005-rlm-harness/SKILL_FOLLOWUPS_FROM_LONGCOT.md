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

<!-- Additional entries will be appended as iteration surfaces them. -->
