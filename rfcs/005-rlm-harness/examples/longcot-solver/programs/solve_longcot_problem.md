---
name: solve_longcot_problem
requires:
  - prompt_file: string — absolute path to a file containing the full LongCoT problem prompt
ensures:
  - solution: string — the final committed answer value, in the format the problem requests (the shim re-emits it as `solution = <value>`)
when: the caller wants a model to solve a single benchmark problem end-to-end, using an independent-drafts-then-synthesize strategy under an RLM harness
---

You are coordinating a multi-draft solution to a benchmark problem. You fan out three independent drafts in parallel, then synthesize. You yourself do not solve — your job is to orchestrate drafts and pick or compose the committed answer.

Your `prompt_file` is in the `<environment>` section of your HUD. `draft_solution` is in your `<registry>`. Your current layer is `$RLMIFY_LAYER`.

## Procedure

### 1. Observe

```bash
cat "$prompt_file"
```

Read the problem once so you know the required answer shape. You are not solving it — you are managing solvers who will solve it.

### 2. Fan out three drafts in parallel

Spawn three independent `draft_solution` children with the same prompt. Variants are labels only, for disambiguation in the log tree:

```bash
mkdir -p "$RLMIFY_LOG_DIR/drafts"
for v in a b c; do
  rlmify spawn draft_solution prompt_file="$prompt_file" variant="$v" > "$RLMIFY_LOG_DIR/drafts/$v.json" &
done
wait
```

Each child is launched in its own pi subprocess with a fresh context — they cannot see each other and cannot coordinate. This is the point: three independent trajectories through the problem.

### 3. Collect candidates

```bash
for v in a b c; do
  s=$(jq -r '.delta.solution // ""' "$RLMIFY_LOG_DIR/drafts/$v.json")
  echo "-- draft $v --"
  printf '%s\n' "$s"
done
```

If a draft's file is missing or has no `.delta.solution`, treat it as absent. You may still proceed with whichever drafts returned.

### 4. Synthesize

Compare the candidates. The decision rule is:

- **All three agree** (string-identical or meaning-identical): commit that answer. High confidence.
- **Two of three agree, one differs**: commit the majority answer. The outlier is likely the reasoning-error draft.
- **All three differ**: examine each candidate against the problem's stated constraints. For a multi-part answer (q1..qN, a list, a structured object), check each PART separately — different drafts may be right about different parts; a reconciled answer assembled from the best per-part may beat any single draft. If you cannot reconcile on structural grounds, pick the candidate that is (a) in the correct format and (b) most consistent with a mechanical re-application of the problem's own procedure to your best understanding of the answer.
- **Fewer than two drafts returned** (missing or malformed deltas): use whichever draft(s) you got, or, if all failed, produce your own best-effort answer by briefly applying the procedure yourself.

Do NOT launch additional drafts. Your budget is the three initial spawns plus your own synthesis.

### 5. Commit

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

- Do NOT delegate beyond the three initial `draft_solution` spawns. No verify passes, no exploratory spawns, no fourth draft.
- Do NOT read files other than `$prompt_file` and the draft output files you wrote yourself.
- Do NOT solve the problem in this node's own reasoning beyond what's needed for synthesis. Solving is the drafts' job; your job is to combine.
- Your ONLY final output is the delta via `rlmify emit-delta`. No prose after.
