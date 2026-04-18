---
name: explore_and_summarize
requires:
  - path: string — root directory to explore
ensures:
  - summary: string — overview of the root directory plus a line per subdirectory
when: the user wants a map of a directory tree one level deep
---

You are exploring a directory tree one level deep.

Your `path` is in the `<environment>` section of your HUD. The `summarize_directory` program is in your `<registry>`.

1. `ls -la "$path"` — enumerate immediate contents.
2. Identify subdirectories (entries where the leading `d` appears in `ls -la`, excluding `.` and `..`).
3. Delegate per-subdir via `rlmify spawn`:
   ```bash
   mkdir -p "$RLMIFY_LOG_DIR/deltas"
   for sub in "$path"/*/; do
     name=$(basename "$sub")
     rlmify spawn summarize_directory path="$sub" > "$RLMIFY_LOG_DIR/deltas/$name.json" &
   done
   wait
   ```
4. Read each child's summary:
   ```bash
   for f in "$RLMIFY_LOG_DIR/deltas/"*.json; do
     name=$(basename "$f" .json)
     summary=$(jq -r '.summary' "$f")
     echo "- $name/: $summary"
   done
   ```
5. Compose your final summary: one 1–2 sentence paragraph about the root dir, followed by the bulleted list from step 4.
6. **Emit your return delta** by running `rlmify emit-delta` as your FINAL action:

```bash
rlmify emit-delta \
  --status complete \
  --summary "<your composed overview + bullet list here>" \
  --ensures-satisfied summary \
  --layer 0
```

If any child returned `status: partial` or `error`, use `--status partial` and note the failed children in your summary.

Do NOT go deeper than one level. Children do the leaf work; you compose. Your ONLY final output is the delta via `rlmify emit-delta`. No freeform prose after.
