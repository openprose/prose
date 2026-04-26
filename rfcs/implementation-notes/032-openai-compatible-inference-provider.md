# 032: Superseded Direct Inference Adapter Experiment

Status: superseded
Date: 2026-04-26
Superseded by: RFC 014 Pi graph VM / node-runner vocabulary

## What This Used To Describe

This note originally described an `openai_compatible` / `openrouter` direct
inference provider. That implementation was removed during the Pi runtime
reorientation.

## Current Decision

OpenProse no longer exposes direct chat-completion adapters as graph runtimes.
The current architecture separates the axes clearly:

- `pi` is the OSS reactive graph VM.
- Per-node execution happens through node runners.
- OpenRouter and OpenAI-compatible endpoints are model providers inside the Pi
  runtime profile.
- Deterministic `--output` values use an internal scripted Pi session for
  tests and hosted-contract fixtures.

Do not reimplement this note as written. Future work should extend the Pi
runtime profile and node-runner boundary rather than reviving flat provider
semantics.

## Current Test Surface

Use these checks for the live architecture:

```bash
bun test test/runtime-profiles.test.ts test/node-runner-registry.test.ts test/pi-node-runner.test.ts test/live-pi-smoke.test.ts
bun run smoke:live-pi
```

For funded live inference:

```bash
OPENPROSE_LIVE_PI_SMOKE=1 \
OPENPROSE_PI_API_KEY="$OPENROUTER_API_KEY" \
bun run smoke:live-pi -- --tier all --run-root .prose/live-pi-runs
```
