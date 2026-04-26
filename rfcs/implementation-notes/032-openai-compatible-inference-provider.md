# 032: OpenAI-Compatible Inference Provider

Status: implemented
Date: 2026-04-26

## What Changed

- Added an `openai_compatible` provider for OpenAI-compatible chat completion
  endpoints.
- Added an `openrouter` alias that defaults to OpenRouter's chat completion
  endpoint and `google/gemini-3-flash-preview`.
- Added provider diagnostics for HTTP failures, malformed model JSON, missing
  required outputs, missing env bindings, and unapproved effects.
- Added a model-backed example graph:
  `examples/inference-decision-brief.prose.md`.
- Added docs for local inference and a new HTML diagram:
  `docs/diagrams/inference-meta-harness.html`.

## Why This Matters

The North Star says OpenProse should be a meta-harness, not its own agent
harness. This slice keeps that boundary:

- Full harnesses such as Pi still own tool/session behavior.
- The new provider is a small local inference adapter for simple model-backed
  examples and OpenAI-compatible endpoints.
- OpenProse owns graph planning, dependency ordering, run materialization,
  artifact validation, traces, and provenance.

## How To Test

Focused deterministic tests:

```bash
bun test test/openai-compatible-provider.test.ts test/provider-registry.test.ts test/examples-tour.test.ts
bun run typecheck
```

Full release checks:

```bash
bun test
bun run typecheck
bun run confidence:runtime
bun run smoke:binary
```

Live Pi harness smoke, when an Anthropic key is available:

```bash
OPENPROSE_PI_INTEGRATION=1 \
OPENPROSE_PI_MODEL_PROVIDER=anthropic \
OPENPROSE_PI_MODEL_ID=claude-haiku-4-5 \
OPENPROSE_PI_API_KEY="$ANTHROPIC_API_KEY" \
OPENPROSE_PI_THINKING_LEVEL=off \
bun test test/pi-provider.test.ts
```

Live decision graph:

```bash
OPENPROSE_PI_MODEL_PROVIDER=anthropic \
OPENPROSE_PI_MODEL_ID=claude-haiku-4-5 \
OPENPROSE_PI_API_KEY="$ANTHROPIC_API_KEY" \
OPENPROSE_PI_THINKING_LEVEL=off \
bun run prose run examples/inference-decision-brief.prose.md \
  --provider pi \
  --run-root /tmp/openprose-live-inference/runs \
  --run-id pi-decision-brief \
  --input decision_question="Should OpenProse prioritize a hosted registry before a hosted runtime?" \
  --input raw_signals="Registry package metadata is stable locally. Runtime provider interop still has risk across Pi, OpenCode, and cloud harnesses. Users can already publish, install, test, and compose package components locally. Enterprise buyers will need org-scoped package discovery before broad managed runtime rollout."
```

Observed local result:

- Pi SDK live smoke passed.
- `pi-decision-brief` graph run succeeded.
- The graph produced `evidence_map`, `risk_register`, and `decision_brief`.

## OpenRouter Note

The provided OpenRouter key reaches OpenRouter but returns HTTP 402
insufficient credits. This is expected provider/account feedback and is now
surfaced as `openai_compatible_http_error`, not as an OpenProse runtime
materialization failure.

## Next

- Keep Pi as the default full-harness path for serious local examples.
- Use `openai_compatible` for lightweight endpoint smoke tests and for users
  who already have an OpenAI-compatible local or hosted model endpoint.
- Add provider-level eval examples once the eval framework needs
  model-judged behavior rather than deterministic fixture checks.
