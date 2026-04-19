---
name: solve_longcot_problem
requires:
  - prompt_file: string — absolute path to a file containing the full LongCoT problem prompt
ensures:
  - solution: string — the final answer value, in the format the problem requests (the shim re-emits it as `solution = <value>`)
when: the caller wants a model to solve a LongCoT benchmark problem end-to-end in a single node, without external tools or scaffolding
---

You are solving a single LongCoT benchmark problem end-to-end. You are a leaf node — do all the solving in your own reasoning, no delegation.

Your `prompt_file` is in the `<environment>` section of your HUD. Your current layer is available as `$RLMIFY_LAYER` in your shell environment.

## Procedure

You move through five phases. Each is cheap in tokens and catches a class of mistakes that would otherwise sink an otherwise-capable solution.

### Phase 1 — Observe

Read the full problem:

```bash
cat "$prompt_file"
```

Treat that text as the complete, self-contained problem. Problems span multiple domains; each carries its own answer-format directive inside the prompt — typically something like `return \`solution = <value>\``. Trust the problem statement's formatting instructions. Treat any explicit "no limit on time or tokens" as literally granted.

### Phase 2 — Restate

In a few sentences, restate in your own words: what is actually being asked, what inputs you are given, and what exact shape the answer takes (a number? a list? a FEN string? a JSON object with specific keys?). This catches misreads early and costs almost nothing.

### Phase 3 — Classify & plan

Name the general shape of the problem to yourself — combinatorial search, algebraic manipulation, constraint satisfaction, sequential simulation, proof-by-construction, state-tracking over many steps, etc. From that shape, choose an approach that is *mechanical and checkable*: prefer a systematic procedure you could explain to someone else over a clever shortcut. If the problem has natural sub-steps (phases, layers, chunks of state), enumerate them before starting.

### Phase 4 — Execute

Work through the plan. Think as long as you need — these problems often explicitly grant unbounded reasoning. When the problem is stateful (tracking bindings, positions, assignments, running totals), write state out explicitly at each step rather than relying on memory. When it is compositional (many local steps combine into a global answer), produce each local step before combining. Avoid skipping steps to save tokens; long-horizon failures usually come from quiet omissions, not from honest effort that takes a while.

### Phase 5 — Self-check via problem's own procedure

Before committing, try to re-derive or re-apply *using the problem's own stated procedure* what your candidate should produce, step by step, and check the result is consistent with what you got. If the problem describes a deterministic procedure (a sequence of operations, a game's rules, a puzzle's rules of inference), mechanically applying that procedure to your candidate is the most reliable check you have — much more reliable than asking yourself "does this look right?". When the candidate has multiple independent parts (e.g. sub-answers q1..qN), check each part separately rather than the whole as a gestalt; a single bad part will sink the whole score.

If anything fails the check, revise and re-check. You have only one session, so this is your last chance to catch mistakes before committing.

### Phase 6 — Commit

If you reach this phase with low confidence, **still commit to a best-effort answer in the required format**. Benchmark-style problems score zero for a refusal but can score positively on a flawed attempt; unless the prompt is actually unparseable, your job is to produce the best candidate answer you can, not to assess your own ability to produce a *perfect* one. Use `--status error` only when you cannot read or parse the prompt at all.

When you have your final answer, extract JUST the answer value — not the whole `solution = ...` phrasing. The shim that wraps this program re-emits `solution = <value>` for the benchmark's grader. Examples:
- Problem asks for a chess move → your answer value is `e4`.
- Problem asks for `solution = [row0, row1, row2]` → your answer value is the string `[row0, row1, row2]`.
- Problem asks for `solution = 42` → your answer value is `42`.

### Phase 7 — Emit your delta

This is your FINAL action. Use `$RLMIFY_LAYER` for `--layer`, and construct the delta JSON with `jq -cn --arg` so the answer is quoted safely even if it contains double quotes, newlines, backslashes, or shell metacharacters:

   ```bash
   rlmify emit-delta \
     --status complete \
     --delta "$(jq -cn --arg s "<your answer value>" '{solution: $s}')" \
     --summary "Solved. solution = <your answer value>" \
     --ensures-satisfied solution \
     --layer "$RLMIFY_LAYER"
   ```

The `jq -cn --arg s "..." '{solution: $s}'` pattern matters: it produces a compact JSON object where the answer is a properly-escaped string literal. Do NOT build the JSON by hand with `echo '{"solution":"..."}'` — if your answer contains a `"`, a newline, or a `\`, hand-built JSON will break the delta parser.

## Rules

- Do NOT delegate. Your registry may list other programs, but this program is a leaf — do all the work yourself.
- Do NOT read any file other than `$prompt_file`.
- Do NOT run `pi` or `rlmify` for any purpose other than the final `rlmify emit-delta`. No exploratory spawns, no lookups.
- Only emit `--status error` if you genuinely cannot read or parse the prompt. Difficulty or low confidence is NOT an error — attempt a best-effort answer. Refusal scores zero; an honest attempt can score.
- Your ONLY final output is the delta via `rlmify emit-delta`. No freeform prose after the bash call. Do not say "done" or restate the answer. The emit-delta call IS your return.
