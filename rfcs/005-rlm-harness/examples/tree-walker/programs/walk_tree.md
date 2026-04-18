---
name: walk_tree
requires:
  - path: string — absolute directory path to explore
  - max_depth: string — integer as string; 0 = leaf (no recursion), N > 0 = recurse up to N more levels
ensures:
  - summary: string — synthesis of this directory AND (when max_depth > 0) its subdirectories, composed from children's deltas
when: the caller wants a recursive, depth-budgeted walk of a directory tree with per-level synthesis
---

You are walking a directory tree with a depth budget.

Your inputs are in the `<environment>` section of your HUD:
- `path` — the directory to process.
- `max_depth` — integer (as a string). `0` means you are a leaf (do NOT recurse). Greater than `0` means you may delegate to `walk_tree` for each subdirectory, passing `max_depth - 1`.

Your current layer is available as `$RLMIFY_LAYER` in your shell environment. Use it for the `--layer` flag when you emit your delta.

## Procedure

1. `ls -la "$path"` — observe immediate contents.

2. Identify subdirectories (lines starting with `d`, excluding `.` and `..`). Count files too.

3. Decide: leaf or recurse?
   - If `max_depth` is `0` OR there are no subdirectories → **leaf branch** (step 4).
   - Otherwise → **recurse branch** (step 5).

4. **Leaf branch.** Write a 1–3 sentence summary of this directory's contents (file count, subdir count, note any README-like files). Optionally read ONE short file if it sharpens the summary. Then jump to step 6.

5. **Recurse branch.** For each subdirectory, spawn `walk_tree` with `max_depth - 1`:

   ```bash
   new_depth=$(( max_depth - 1 ))
   deltadir="$RLMIFY_LOG_DIR/deltas/layer${RLMIFY_LAYER}-$(echo "$path" | tr '/' '_')"
   mkdir -p "$deltadir"
   for sub in "$path"/*/; do
     [ -d "$sub" ] || continue
     subname=$(basename "$sub")
     rlmify spawn walk_tree path="$sub" max_depth="$new_depth" > "$deltadir/$subname.json" &
   done
   wait
   ```

   Then read each child's summary and synthesize:

   ```bash
   child_bullets=""
   for f in "$deltadir"/*.json; do
     [ -f "$f" ] || continue
     subname=$(basename "$f" .json)
     s=$(jq -r '.summary // .error // "no output"' "$f")
     child_bullets+="- ${subname}/: ${s}"$'\n'
   done
   ```

   Write your synthesis as: a 1-sentence overview of the directory itself (from step 1), a blank line, then the `child_bullets` list. Mention any `status: partial` or `error` children explicitly.

6. **Emit your delta** as your FINAL action. Use `$RLMIFY_LAYER` for `--layer`:

   ```bash
   rlmify emit-delta \
     --status complete \
     --summary "<your synthesis from step 4 or 5>" \
     --ensures-satisfied summary \
     --layer "$RLMIFY_LAYER"
   ```

   If any child returned `status: partial` or `error`, use `--status partial` and explicitly note in your summary which child(ren) failed.

## Rules

- Do NOT read files in subdirectories from THIS node when taking the recurse branch — that's the child's job. Stay at your layer.
- When `max_depth = 0`, you MUST NOT spawn. You are strictly a leaf.
- Your ONLY final output is the delta via `rlmify emit-delta`. No prose after. No "done" message. The bash call IS your return.
