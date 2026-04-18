# directory-explorer — rlmify POC

A minimal proof-of-concept for the `rlmify` skill. A single level of recursion: the root RLM explores a directory, fans out one child per subdirectory to summarize its contents, then composes the results.

## What this demonstrates

- **Interpreter / program split.** The skill (`skills/rlmify/`) contains only the interpreter. The programs (`programs/*.md`) are separate artifacts with public-face frontmatter and a body.
- **Registry in the HUD.** The root HUD's `<registry>` lists `summarize_directory` by its public face only; the child sees the body when `rlmify spawn` composes its HUD.
- **CLI-backed delegation.** The root writes ordinary bash (`rlmify spawn summarize_directory path=...`); the `rlmify` binary handles HUD composition, pi invocation, and delta extraction.
- **Delta returns.** Each child emits an `~~~rlm-delta ... ~~~` block that `rlmify spawn` parses into pretty JSON; the root composes from those.

## Prerequisites

- `pi` on PATH (tested with `@mariozechner/pi-coding-agent`).
- `bun` on PATH (the rlmify CLI is a Bun/TypeScript executable).
- `jq` on PATH (used by the root program to read child deltas).
- A provider key: `GEMINI_API_KEY` (default) or whichever provider/model you prefer.

First-time setup (one-time):

```bash
cd skills/rlmify/bin && bun install
```

## Run

```bash
GEMINI_API_KEY=... ./run.sh /path/to/some/directory
```

Artifacts are written to `$RLMIFY_LOG_DIR` (default `/tmp/rlmify-runs/latest`):

- `root.hud` — the composed root HUD.
- `root.out` — raw pi stdout from the root.
- `root.session.jsonl` — pi's session trace.
- `child-<suffix>.hud` / `.out` / `.session.jsonl` — one triple per spawned child.
- `deltas/*.json` — child delta JSONs the root captured via bash.

## Layout

```
directory-explorer/
├── programs/
│   ├── explore_and_summarize.md   # root program: fans out + composes
│   └── summarize_directory.md     # child program: leaf, describes one dir
├── run.sh                         # sets env, calls `rlmify run`
└── README.md
```

## Known limitations (by design, for v1)

- One level deep only. `summarize_directory` does not recurse.
- Last-write-wins on conflicting sibling deltas (not exercised here since children are disjoint).
- No streaming — child deltas are atomic.
- Child registry is empty by default (leaves can't further delegate). Parent-propagated scoped registries are a v1.1 feature.
