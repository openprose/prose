# Session To Prose

## Quick Start

```bash
prose run src/session-to-prose.prose.md \
  --session-source /path/to/session.jsonl \
  --baseline-run runs/previous-session-to-prose-run \
  --agent-harness auto
```

## What This Repository Does

Turns a Claude Code, Codex, or Pi agent session log into a reusable OpenProse
Contract Markdown program.

The example resolves a local session path or id, snapshots the log, extracts
phases and decision gates, assembles a generated `*.prose.md` system, validates
the result, and publishes receipt and tail/citation audits so reviewers can
tell what evidence was used.

It also demonstrates the V5 quality gate used while developing this example:
an earlier run can be supplied as `baseline-run` so generated program and report
detail cannot regress while newer receipt, harness, source-provenance, and
tail-audit surfaces are added.

## Source Shape

- `src/`: the session extraction system
- `dist/`: compiled intent if the example is compiled
- `runs/`: activation receipts produced by local runs
- `state/`: durable local state if a harness enables it
- `deps/`: installed OpenProse dependencies

## Try It With Local Sessions

Use a local session JSONL path from one of the supported harnesses:

- Claude Code: `~/.claude/projects/**/*.jsonl`
- Codex: `~/.codex/sessions/**/*.jsonl`
- Pi: `~/.pi/agent/sessions/**/*.jsonl`

The generated run keeps raw session JSONL in `workspace/` by default and
publishes only declared outputs under `bindings/`.
