# Return — The Delta Contract

When your responsibility is satisfied, your final output is a **return delta**. This is your exit action. It is not wrapped in a bash call, not inside a function — it is a distinct emission at the end of your response.

## Preferred: use `rlmify emit-delta`

The CLI validates your fields and formats the wire block correctly:

```bash
rlmify emit-delta \
  --status complete \
  --summary "Explored 3 subdirectories and composed a one-level map" \
  --delta '{"summary":"...full composed text..."}' \
  --layer 0 \
  --ensures-satisfied summary
```

Or pipe a full JSON object on stdin:

```bash
echo '{
  "status": "complete",
  "delta": {"summary": "..."},
  "provenance": {"layer": 0, "model": "gemini-2.5-pro", "ensures_satisfied": ["summary"]},
  "summary": "..."
}' | rlmify emit-delta
```

The CLI writes the fenced block to stdout. Invalid input → exit 2 with the offending field named on stderr.

## The wire format (for reference or hand-writing)

Between these exact fences, verbatim:

```
~~~rlm-delta
{
  "status": "complete",
  "delta": { ... },
  "provenance": {
    "layer": 0,
    "model": "<model-id-if-known>",
    "ensures_satisfied": ["..."],
    "requires_consumed": ["..."]
  },
  "summary": "<1–3 sentence plain-English recap>"
}
~~~
```

The block is parseable JSON inside the `~~~rlm-delta` ... `~~~` fences. Nothing else on the fence lines. Don't wrap the block in backticks or any other quoting.

## Fields

- **`status`** — one of:
  - `complete` — every `ensures` in your return contract is satisfied.
  - `partial` — some progress, some ensures unmet; explain in `summary`.
  - `error` — could not proceed; explain in `summary`.
- **`delta`** — JSON object describing what changed in the HUD slice you were given. For a summarization task, typically `{ "summary": "..." }`. For a mutation task, the fields you changed with their new values.
- **`provenance`**:
  - `layer`: integer depth (root = 0).
  - `model`: the model id you are running as, if known.
  - `ensures_satisfied`: list of contract clauses you fulfilled.
  - `requires_consumed`: list of `requires` inputs you actually used.
- **`summary`** — short human-readable recap.

## Parsing a child's return

Children invoked via `rlmify spawn` have their deltas **already extracted and pretty-printed to stdout**. You do not need to parse fence blocks yourself. Just capture the subprocess's stdout and read fields with `jq`:

```bash
rlmify spawn summarize_directory path=/some/dir > child.json
jq -r '.summary' child.json
jq -r '.status' child.json
```

If you ever do need to extract a delta from raw text (e.g. reading your parent's `$RLMIFY_LOG_DIR/*.out` file), the pattern is simple:

```bash
awk '/^~~~rlm-delta$/{f=1; next} /^~~~$/{f=0} f' some.out | jq .
```

## Composition rules

- **Trust tier**: a child's `delta` is a summary, not source of truth. If you need ground truth, re-observe.
- **Conflicts**: when sibling deltas modify overlapping fields, v1 is last-write-wins. Design fan-outs so siblings are disjoint.
- **Errors**: if a child returns `status: error`, you may retry once, fall back to local handling, or propagate in your own return (`status: partial` with the error noted in `summary`).

## What not to do

- Do not emit prose after the closing fence. Inner nodes stop at the fence.
- Do not embed the delta inside a code block of any other kind (triple-backtick, etc.). Use the `~~~rlm-delta` fence exactly.
- Do not return multiple delta blocks. One node = one delta per invocation. (If your output happens to show drafts during reasoning, only the LAST fence block is read.)
