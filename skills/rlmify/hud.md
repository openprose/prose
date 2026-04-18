# HUD — Heads-Up Display

Your HUD is an XML block named `<rlm_hud>` inside your system prompt. It is the complete, scoped view of your world for this invocation. Read it before acting.

## Sections (in order)

### `<responsibility>`
What you are accountable for. This is the program body — the instructions for *what to accomplish*. Re-read before each major decision.

### `<return_contract>`
What "done" looks like. Describes the shape of the delta you must emit. Typically names specific `ensures` fields you are promising to produce.

### `<system_purpose>`
High-level mission of the broader system you are part of. Mission briefing.

### `<environmental_context>`
Where your slice fits in the larger whole. Notably: your depth in the recursion tree, and whether you are the root or an inner node.

### `<environment>`
**Source of truth.** Observed state at the highest granularity available — file contents, directory listings, arg values, whatever the parent injected. When this conflicts with a summary elsewhere, this wins.

### `<registry>`
Programs you can delegate to. Each `<program>` entry is a **public face only**:

- `<name>` — identifier to pass to `rlmify spawn`.
- `<requires>` — what the program needs from you.
- `<ensures>` — what it guarantees to return.
- `<when>` — when to reach for it.

The program's body is **not** in the registry. Bodies are only seen by callees, not by callers. The `rlmify` CLI resolves the name to the body automatically when you delegate — see `delegation.md`.

The registry is scoped to you. Your parent already narrowed it; you may narrow it further for your own children. If you discover capabilities during exploration, `rlmify list-programs` and `rlmify resolve` show what's available in the current scope.

### `<action_history>`
Trajectory of actions taken so far in this node's lifetime: commands run, files read, child deltas received. Folded into the HUD rather than left as separate messages. When you act, mentally append to this list.

## Source of truth vs. summaries

The `<environment>` section and direct tool output are **source of truth**. Any section or value labeled as a summary (including child deltas' `summary` field) is a compressed approximation. When source and summary conflict, trust source.
