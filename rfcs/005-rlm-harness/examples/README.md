# RLM harness — examples

Proofs-of-concept for the `rlmify` skill and the RFC it implements. These live here (alongside the RFC) rather than inside `skills/rlmify/` because:

- They are RFC evidence, not part of the installed skill.
- Each example targets a specific architectural claim in [`RLM_CONTEXT.md`](../RLM_CONTEXT.md) / [`RLM_HARNESS_DRAFT.md`](../RLM_HARNESS_DRAFT.md) — passing means that claim holds under a real pi-backed run; failing is itself a finding worth keeping.
- The skill stays small and install-clean.

Until the RFC graduates out of draft status, treat these as load-bearing experiments, not polished demos. The interpreter + binary in `skills/rlmify/` are the supported surface; everything here is still a probe.

## Examples

| Example | RFC claim under test | Status |
|---|---|---|
| [`directory-explorer/`](directory-explorer/) | Depth-1 fan-out: interpreter/program split, registry-in-HUD, CLI-backed delegation, delta returns — all end-to-end through one layer. | Passing (see `skills/rlmify/README.md` §"Lessons from building this POC"). |
| [`tree-walker/`](tree-walker/) | **Actual recursion.** A single recursive program `walk_tree(path, max_depth)` self-delegates through multiple layers; child-scoped registry inheritance; `RLMIFY_LAYER` propagation; per-level delta synthesis. Depth-1 is fan-out; this is the first example where the RLM metaphor (a call stack across pi processes) is literally true. | Passing at `max_depth=2` (3 layers, 7 pi processes). |

## Running

Each example has its own `run.sh` and `README.md`. From the repo root:

```bash
cd skills/rlmify/bin && bun install       # one-time
GEMINI_API_KEY=... ./rfcs/005-rlm-harness/examples/directory-explorer/run.sh /tmp/some-dir
GEMINI_API_KEY=... ./rfcs/005-rlm-harness/examples/tree-walker/run.sh /tmp/some-tree 2
```

Every run writes full forensic artifacts (each node's HUD, pi session, captured deltas) under `$RLMIFY_LOG_DIR` — this is essential for debugging an RLM whose "execution" is a tree of subprocesses.

## Candidate next examples

Ranked by how much architectural pressure they put on as-yet-unexercised claims:

1. **Repo analyzer with typed file routing** — tests `rlmify resolve` and contract-based dispatch (the thing that distinguishes our registry from a plain function table).
2. **`Map<P>` / higher-order programs** — tests "programs as first-class values" by passing a program's name as an argument to another program.
3. **Error-tolerant composer** — tests the `status: partial | error` pipeline when some children fail or return incomplete deltas.

See [`skills/rlmify/README.md` §Next steps](../../../skills/rlmify/README.md#next-steps) for the ordered backlog.
