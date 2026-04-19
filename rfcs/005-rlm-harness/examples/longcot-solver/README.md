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

## Configuring thinking level

`skills/rlmify/bin/src/lib/pi.ts` reads the `RLMIFY_THINKING` env var (fallback `low`) and applies it to every pi subprocess in the tree. Valid values: `off`, `minimal`, `low`, `medium`, `high`, `xhigh`.

- **Locally:** `RLMIFY_THINKING=high ./run.sh /tmp/lc-problem.txt`. `run.sh` already defaults to `high` when unset, matching the paper's "highest setting if available" baseline.
- **In CI:** the `longcot-rlmify.yml` workflow exposes a `thinking` input (default `high`) that the shim forwards via `RLMIFY_THINKING`.

## Heterogeneous fan-out

`rlmify spawn` now accepts per-child overrides: `--thinking <level>` and `--model <model>`. These set the child's `RLMIFY_THINKING`/`RLMIFY_MODEL` env, so a single fan-out can mix budgets — e.g. one premium draft plus two cheap drafts:

```bash
rlmify spawn draft_solution prompt_file=... variant=a --thinking=high
rlmify spawn draft_solution prompt_file=... variant=b --thinking=low
rlmify spawn draft_solution prompt_file=... variant=c --thinking=low
```

Asymmetric delegation addresses the correlated-error failure mode seen in same-model/same-thinking fan-outs: a higher-budget draft is less likely to replicate the systematic bias of its cheaper siblings.

## Declaring required spawns

Program frontmatter may declare `required_spawns: [name1, name2]`. Declared spawns are rendered in a `<required_spawns>` HUD section; after the root session completes, `rlmify run` scans `session.jsonl` and emits warnings to stderr for any declared spawn that wasn't invoked. Warn-only in v1 — no auto-retry, no error exit.

## v1 limitations / future work

- **Depth 0 only (this example).** No delegation, no subproblem decomposition, no branching. Sibling examples and later iterations of `longcot-solver` layer on `plan_then_solve`, fan-out drafts, and domain-specific decomposers.
- **Per-call usage not surfaced.** `rlmify run` doesn't aggregate pi's per-call token counts into its delta; the shim zeroes the `usage` fields rather than parsing `session.jsonl`.
- **CI usage.** `.github/scripts/longcot/run_rlmify.py` wraps this example: for each benchmark question, it creates a per-question `RLMIFY_LOG_DIR`, writes the prompt to `prompt.txt`, invokes `rlmify run` (with `RLMIFY_THINKING` from its `--thinking` flag), parses the delta from stdout, pulls `.delta.solution`, and formats the result as JSONL rows that the benchmark's `run_eval.py` consumes. That shim is the actual benchmark driver; this example is the unit that runs per question.
