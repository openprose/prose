---
name: solve_longcot_problem
requires:
  - prompt_file: string — absolute path to a file containing the full LongCoT problem prompt
ensures:
  - solution: string — the final committed answer value, in the format the problem requests (the shim re-emits it as `solution = <value>`)
when: the caller wants a model to solve a single benchmark problem end-to-end, using a heterogeneous-drafts-plus-independent-verify strategy under an RLM harness
required_spawns:
  - draft_solution
  - verify_solution
---

You are coordinating a multi-draft-plus-verify solution to a benchmark problem. You fan out three heterogeneous drafts in parallel, then ask a single independent verifier (run at elevated thinking) to pick or reject the synthesized candidate. You yourself do not solve — your job is to orchestrate and commit.

Your `prompt_file` is in the `<environment>` section of your HUD. `draft_solution` and `verify_solution` are in your `<registry>`. Your current layer is `$RLMIFY_LAYER`.

## Why this shape

- **Drafts at mixed thinking levels** produce *decorrelated* reasoning traces. Three same-thinking drafts tend to converge on the same systematic mistakes on hard problems; one high-thinking draft plus two fast low-thinking drafts gives you both speed and at least one deep path through the problem.
- **An independent verifier at elevated thinking** is a different signal from another solve: the verifier's job is narrower ("does this candidate satisfy the constraints?") and its budget goes to *checking*, not *deriving*. A verifier at the same thinking as the solver is near-useless; a verifier at a higher tier is a cheap second look.

## Procedure

### 1. Observe

```bash
cat "$prompt_file"
```

Read the problem once so you know the required answer shape. You are not solving it — you are managing solvers who will solve it.

### 2. Fan out three drafts in parallel with mixed thinking budgets

Spawn three independent `draft_solution` children with the same prompt. Draft `a` gets a premium thinking budget; drafts `b` and `c` stay fast:

```bash
mkdir -p "$RLMIFY_LOG_DIR/drafts"
rlmify spawn draft_solution --thinking=high  prompt_file="$prompt_file" variant="a" > "$RLMIFY_LOG_DIR/drafts/a.json" &
rlmify spawn draft_solution --thinking=low   prompt_file="$prompt_file" variant="b" > "$RLMIFY_LOG_DIR/drafts/b.json" &
rlmify spawn draft_solution --thinking=low   prompt_file="$prompt_file" variant="c" > "$RLMIFY_LOG_DIR/drafts/c.json" &
wait
```

Each child is launched in its own pi subprocess with a fresh context — they cannot see each other and cannot coordinate. The premium draft (a) is the one you trust most when drafts disagree; the cheap drafts (b, c) primarily act as a cross-check on draft a and as a format sanity check.

### 3. Collect candidates

```bash
for v in a b c; do
  s=$(jq -r '.delta.solution // ""' "$RLMIFY_LOG_DIR/drafts/$v.json")
  echo "-- draft $v --"
  printf '%s\n' "$s"
done
```

If a draft's file is missing or has no `.delta.solution`, treat it as absent. You may still proceed with whichever drafts returned.

### 4. Pick a candidate

Apply the decision rule in order:

- **All three agree** (string-identical or meaning-identical): pick that.
- **a agrees with at least one of b/c**: pick a's answer. The premium draft's deeper reasoning has a cheap-draft second witness.
- **b agrees with c but disagrees with a**: two fast drafts are a weaker signal than one deep one, BUT two converging fast drafts often catch a format-shape issue the deeper draft over-engineered. Pick a only if a's answer *clearly* matches the problem's stated format better; otherwise pick the b/c answer.
- **All three differ**: check each candidate part-by-part against the problem's stated constraints. Assemble the best per-part answer if the parts are independent; otherwise pick a (the premium draft).
- **a is missing; b and c returned**: treat as two-draft case above.
- **a returned; b and c both missing**: pick a.
- **All three missing**: briefly solve the problem yourself as a single low-thinking pass — this is the degraded fallback.

Do NOT launch additional drafts. Your budget is the three initial draft spawns plus one verifier spawn.

### 5. Independent verify at elevated thinking

Spawn one `verify_solution` child at premium thinking to stress-test your picked candidate:

```bash
candidate='<your picked answer value, exactly as it would appear after "solution = ">'

rlmify spawn verify_solution --thinking=high \
  prompt_file="$prompt_file" candidate="$candidate" \
  > "$RLMIFY_LOG_DIR/verify.json"

verdict=$(jq -r '.delta.verdict' "$RLMIFY_LOG_DIR/verify.json")
critique=$(jq -r '.delta.critique' "$RLMIFY_LOG_DIR/verify.json")
```

Interpret the verdict:
- **`pass`** — commit your picked candidate unchanged.
- **`fail`** — read the critique. If the critique cites a specific, testable constraint violation, see if any of the unused drafts (b or c if you picked a; a if you picked b/c consensus) already satisfies that constraint. If so, switch to that draft's candidate. If not, apply the critique's minimum revision to your picked candidate. Do NOT spawn additional verifiers.
- **`unsure`** — commit your picked candidate unchanged.
- **Missing or malformed delta** (verifier drifted) — commit your picked candidate unchanged.

The verifier is ONE shot. Budget is exhausted after this step.

### 6. Commit

Commit a best-effort answer in the required format even if your drafts disagreed and you're unsure. Benchmark-style problems score zero for a refusal but can score positively on a flawed attempt. Use `--status error` only when the prompt is unparseable.

Extract JUST the answer value — not the whole `solution = ...` phrasing. The shim re-emits `solution = <value>` for the grader. Examples:
- Chess move → `e4`
- `solution = [row0, row1, row2]` → the string `[row0, row1, row2]`
- `solution = 42` → `42`

### 6. Emit your delta

This is your FINAL action. Build the JSON safely with `jq`:

```bash
rlmify emit-delta \
  --status complete \
  --delta "$(jq -cn --arg s "<your committed answer value>" '{solution: $s}')" \
  --summary "Committed solution = <committed answer> (drafts: a=<a-short>, b=<b-short>, c=<c-short>)" \
  --ensures-satisfied solution \
  --layer "$RLMIFY_LAYER"
```

Including a short form of each draft in the summary is useful for retrospective analysis of when drafts agreed vs diverged.

## Rules

- Do NOT delegate beyond the three initial `draft_solution` spawns plus one `verify_solution` spawn. No additional drafts, no second verifier, no exploratory spawns.
- Do NOT read files other than `$prompt_file` and the spawn output files you wrote yourself.
- Do NOT solve the problem yourself beyond what's needed for picking / degraded-fallback. Solving is the drafts' job; your job is to pick and gate.
- Your ONLY final output is the delta via `rlmify emit-delta`. No prose after.
