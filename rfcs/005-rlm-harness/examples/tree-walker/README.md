# tree-walker — rlmify recursion POC

Walks a directory tree to a bounded depth with per-level synthesis. The same program (`walk_tree`) runs at every level: at layer 0, 1, …, up to `max_depth`. Each node summarizes its own directory; when its budget allows, it recursively delegates to itself for each subdirectory and composes the returned deltas.

This is the first POC that exercises **actual recursion** (depth 2+). `directory-explorer` is a depth-1 fan-out; this is a real RLM call stack.

## What this demonstrates (beyond directory-explorer)

- **Self-delegation.** `walk_tree` appears in its own children's `<registry>`, so each layer can spawn another `walk_tree` for a subdir — the program is recursive without any special-case in the interpreter.
- **Layer propagation.** `RLMIFY_LAYER` is set to `0` for the root and incremented by `rlmify spawn` for each child. The program reads `$RLMIFY_LAYER` when emitting its delta, so `provenance.layer` honestly reflects depth.
- **Child-scoped registry inheritance.** `rlmify run --registry-auto` sets `RLMIFY_CHILD_REGISTRY=all` in the root pi's env; `rlmify spawn` picks that up and populates the child's registry with every program in `$RLMIFY_PROGRAMS` (including `walk_tree` itself).
- **Depth-budgeted termination.** `max_depth` is a plain environment value; each layer passes `max_depth - 1` to its children. When it reaches `0`, the child takes the leaf branch and does not spawn.
- **Per-level composition.** Layer 2 grandchildren return one-sentence summaries; layer 1 children return their own one-sentence summary plus a bullet list synthesized from their grandchildren; the root produces the whole tree report.

## Prerequisites

Same as `directory-explorer`: `pi`, `bun`, `jq` on PATH, and a provider key (default uses `GEMINI_API_KEY`).

First-time setup:

```bash
cd skills/rlmify/bin && bun install
```

## Run

```bash
GEMINI_API_KEY=... ./run.sh /path/to/some/tree [max_depth]
```

`max_depth` defaults to `2`. A 3-subdir × 2-level tree produces 1 + 3 + N pi invocations where N is the total number of grandchildren with non-empty parents.

Example with a 3-dir × mixed-depth tree:

```bash
GEMINI_API_KEY=... ./run.sh /tmp/rlmify-tree-test 2
```

Artifacts land in `$RLMIFY_LOG_DIR` (default `/tmp/rlmify-runs/tree-walker-latest`):

- `root.hud` / `root.out` / `root.session.jsonl` — layer 0.
- `child-walk_tree-<sanitized-path>.{hud,out,session.jsonl}` — one triple per spawned node (layers 1 and 2).
- `deltas/layer<N>-<sanitized-parent-path>/<subdir>.json` — each delta the parent captured on stdout, namespaced by parent layer+path so recursive nodes don't collide.

## Expected call graph

For a tree like:

```
root/
├── alpha/
│   ├── sub-a/
│   └── sub-b/
├── beta/
│   └── inner/
└── gamma/
    └── main.py
```

with `max_depth=2`, seven pi processes run:

```
layer 0: walk_tree(root, max_depth=2)
├── layer 1: walk_tree(alpha, max_depth=1)
│   ├── layer 2: walk_tree(sub-a, max_depth=0)   [leaf]
│   └── layer 2: walk_tree(sub-b, max_depth=0)   [leaf]
├── layer 1: walk_tree(beta, max_depth=1)
│   └── layer 2: walk_tree(inner, max_depth=0)   [leaf]
└── layer 1: walk_tree(gamma, max_depth=1)
                                                   [no subdirs → leaf branch in-place]
```

## Layout

```
tree-walker/
├── programs/
│   └── walk_tree.md    # single recursive program; branches on max_depth/subdirs
├── run.sh              # sets env, calls `rlmify run --registry-auto`
└── README.md
```

## What this stresses

- Pi cold-start cost scales linearly with nodes (here: 7 processes for a 3×2 tree). A real RLM harness would pool/reuse.
- The registry in every layer's HUD lists `walk_tree` — a good data point if we want to test "program knows itself is self-referential" in future programs.
- The delta JSON surface is intentionally kept to a single `summary` string so composition stays mechanical. A future variant could return a structured `tree` object and test whether deeper composition stays coherent.
