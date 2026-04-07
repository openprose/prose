---
description: Evaluate a completed OpenProse run
argument-hint: <run-id>
---

Inspect and evaluate the completed run: $ARGUMENTS

This command is sugar for `prose run std/evals/inspector -- run_id: <run-id>`. It evaluates:

1. **Execution trace** — reads `state.md` to reconstruct the run timeline
2. **Contract satisfaction** — checks whether each service's `ensures` commitments were met
3. **Error analysis** — reviews any errors, their handling, and downstream impact
4. **Output quality** — evaluates the final output against the program's top-level `ensures`

The run ID corresponds to a directory in `.prose/runs/` (e.g., `20260317-143052-a7b3c9`). The inspector reads the manifest, state log, workspace files, and bindings to produce a comprehensive evaluation.

If no run ID is specified, show recent runs and ask which one to inspect (equivalent to `prose status` followed by selection).
