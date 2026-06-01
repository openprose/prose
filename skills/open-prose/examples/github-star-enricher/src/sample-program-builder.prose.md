---
name: sample-program-builder
kind: responsibility
---

# Sample Program Builder

> A **per-stargazer** responsibility (`sample-program-builder[user]`) that, for a
> high-fit stargazer, builds a tiny OpenProse program for their inferred pain and
> **runs** it on public-or-synthetic-safe inputs. The execution-backed sample
> result — not a lead score — is the artifact the outreach packet carries. It is
> the heaviest node, and it stays dark unless the cost-and-fit gate is open.

### Requires

- This user's `intent-safety-scorer` **`track`** facet — and only that facet. The
  builder wakes only when the track becomes `build_sample`; a low- or mid-fit user
  (track `defer` / `watch`) never wakes it, so the heavy build never runs for
  them.

### Maintains

The sample result pack, as this responsibility's maintained truth (read by
reference, postconditions self-policed, no separate judge beat):

- `program_name`, `responsibility`, `run_inputs` — the generated OpenProse
  program, built for the stargazer's company's `likely_operational_burdens`.
- `sample_artifact`, `run_status` — the **output of actually running** that
  program on synthetic-safe inputs (no private data, public evidence only).
- `limitations` — explicit caveats (dry-run inputs; no private access).
- a cheap `built: false` truth when the track is not `build_sample`.

This is a facet-less producer exposing the single **atomic facet** (the exported
`ATOMIC_FACET` constant, never `"*"`).

### Continuity

input-driven: re-renders when the selected track changes and the daily
sample-build budget allows it. Select at most one sample build per user unless a
human explicitly requests more. Use only public evidence or synthetic-safe
inputs.
