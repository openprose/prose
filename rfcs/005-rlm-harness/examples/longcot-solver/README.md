# longcot-solver — rlmify as a LongCoT benchmark harness

Driver for running [LongCoT](../../long-cot-bench/long-cot-bench.md) benchmark problems through the rlmified `pi` harness. v1 is depth 0 — a single root node that reads one problem prompt, thinks, and emits a delta whose `solution` field contains the final answer value. Future versions will add `plan_then_solve`, domain-specific decomposers (chess minimax, chemistry cascade, CS simulation, etc.), and delegation across subproblem DAGs.

## What this demonstrates

- **rlmify as a single-shot model harness.** No recursion, no fan-out — just the minimum scaffolding to drive a model through a benchmark question and capture a structured answer. Validates that the interpreter works for non-tree-shaped workloads.
- **Answer-format passthrough.** Each LongCoT problem carries its own answer-format directive (`return `solution = <value>``); the program trusts the prompt and returns only the extracted value. The Python shim (`.github/scripts/longcot/run_rlmify.py`) re-wraps it as `solution = <value>` for the benchmark's grader.
- **Depth-0 contract.** The registry is empty; the root is a leaf. Good baseline before layering decomposers on top.

## Prerequisites

Same as the other `rlmify` examples:

- `pi` on PATH (tested with `@mariozechner/pi-coding-agent`).
- `bun` on PATH (the rlmify CLI is a Bun/TypeScript executable).
- `jq` on PATH (the program uses `jq -cn --arg` to build its delta safely).
- A provider key (e.g. `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, depending on `RLMIFY_MODEL`).

First-time setup (one-time):

```bash
cd skills/rlmify/bin && bun install
```

## Quick local test

```bash
cat > /tmp/lc-problem.txt <<'EOF'
Compute 2 * 21. Return `solution = <number>`.
EOF

RLMIFY_MODEL=anthropic/claude-haiku-4-5 ANTHROPIC_API_KEY=... ./run.sh /tmp/lc-problem.txt
```

Expected stdout: a pretty-printed JSON delta with `.delta.solution == "42"` and `.status == "complete"`. The shim that wraps this for CI reads exactly that field.

## Artifacts

Written to `$RLMIFY_LOG_DIR` (default `/tmp/rlmify-runs/longcot-solver-latest`):

- `root.hud` — the composed root HUD, including the `solve_longcot_problem` body and the `prompt_file` value in `<environment>`.
- `root.out` — raw pi stdout from the root, including the `~~~rlm-delta ... ~~~` fence.
- `root.session.jsonl` — pi's session trace (tool calls, reasoning, final response).

No `child-*.{hud,out,session.jsonl}` or `deltas/` files appear: this is a depth-0 run with no spawns.

## Layout

```
longcot-solver/
├── programs/
│   └── solve_longcot_problem.md   # single depth-0 program: read, think, emit
├── run.sh                         # sets env, calls `rlmify run --registry-auto`
└── README.md
```

## v1 limitations / future work

- **Depth 0 only.** No delegation, no subproblem decomposition, no branching. A real long-horizon harness would at minimum add `plan_then_solve` (plan at the root, delegate each plan step to a solver child, compose), plus domain-specific decomposers.
- **Thinking budget is hardcoded.** `skills/rlmify/bin/pi.ts` currently passes `--thinking low` unconditionally. LongCoT problems are reasoning-heavy — for real benchmark runs we'd want to patch `pi.ts` to read an `RLMIFY_THINKING` env var (or make it a first-class `rlmify run` flag) and bump to `medium`/`high`. Until then, expect weak results on hard-tier problems.
- **CI usage.** `.github/scripts/longcot/run_rlmify.py` wraps this example: for each benchmark question, it creates a per-question `RLMIFY_LOG_DIR`, writes the prompt to `prompt.txt`, runs `./run.sh`, parses the delta from stdout, pulls `.delta.solution`, and formats the result as JSONL rows that the benchmark's `run_eval.py` consumes. That shim is the actual benchmark driver; this example is the unit that runs per question.
