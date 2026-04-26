---
description: Inspect a completed OpenProse run
argument-hint: <run-id>
---

Inspect the completed run: $ARGUMENTS

Use `status` and `trace` against the local run root:

```bash
bun run prose status .prose/runs
bun run prose trace .prose/runs/$ARGUMENTS
```

The trace reads the run record, plan, artifact records, node records, and
runtime trace. If the user wants a formal judgment, run the appropriate eval
program separately with `bun run prose eval`.

If no run ID is specified, show recent runs and ask which one to inspect (equivalent to `prose status` followed by selection).
