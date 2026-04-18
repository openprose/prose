---
name: summarize_directory
requires:
  - path: string — path to the directory to summarize
ensures:
  - summary: string — 1–3 sentence description of the directory's contents
when: the parent needs a brief description of what's inside a single directory, no recursion into grandchildren
---

You are summarizing a single directory for your parent.

Your `path` is in the `<environment>` section of your HUD.

1. `ls -la "$path"` to see immediate contents.
2. Count files and subdirectories. Note README/overview files if present.
3. Optionally read ONE short file (README, or the most obviously informative file) if it sharpens the summary. Keep reads small.
4. Form a 1–3 sentence summary in your head. Concrete is better than vague.
5. **Emit your return delta by running this EXACT bash command** (this is your final action; do not narrate afterward):

```bash
rlmify emit-delta \
  --status complete \
  --summary "<your 1–3 sentence summary here>" \
  --ensures-satisfied summary \
  --layer 1
```

Do NOT recurse into subdirectories. Do NOT delegate. You are a leaf — one level, then return via `rlmify emit-delta`.

Your ONLY final output is the delta. Do not write prose to the user. Do not say "done" or "task complete". The bash call to `rlmify emit-delta` IS your return.
