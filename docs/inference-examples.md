# Inference Examples

OpenProse now has two local inference paths:

- `openai_compatible` / `openrouter`: a minimal adapter for OpenAI-compatible
  chat completion endpoints. It is useful for small local examples and smoke
  tests where the provider returns typed output artifacts as JSON.
- `pi`: a harness-backed provider. It runs a real agent harness session for
  each selected graph node, writes declared output files, and lets OpenProse
  materialize those files as runs.

The important shape is the same in both cases: OpenProse is the meta-harness.
It plans the graph, invokes one provider session per selected node, validates
outputs, stores artifacts, and passes accepted upstream artifacts downstream.

## Decision Brief

[`examples/inference-decision-brief.prose.md`](../examples/inference-decision-brief.prose.md)
is the first model-backed capability example. It turns caller-provided decision
notes into:

- `evidence_map`
- `risk_register`
- `decision_brief`

The graph is deliberately compact:

1. `evidence-extractor` receives the decision question and raw signals.
2. `risk-synthesizer` receives the accepted evidence artifact.
3. `decision-brief-writer` receives the evidence and risk artifacts.

## Local OpenAI-Compatible Run

Use this when you have a funded OpenAI-compatible endpoint:

```bash
OPENPROSE_OPENAI_COMPATIBLE_API_KEY="$OPENROUTER_API_KEY" \
OPENPROSE_OPENAI_COMPATIBLE_BASE_URL=https://openrouter.ai/api/v1 \
OPENPROSE_OPENAI_COMPATIBLE_MODEL=google/gemini-3-flash-preview \
bun run prose run examples/inference-decision-brief.prose.md \
  --provider openai_compatible \
  --run-root /tmp/openprose-live-inference/runs \
  --run-id openai-compatible-decision-brief \
  --input decision_question="Should OpenProse prioritize a hosted registry before a hosted runtime?" \
  --input raw_signals="Registry package metadata is stable locally. Runtime provider interop still has risk. Users can already publish, install, test, and compose package components locally."
```

The repository test suite covers this path against a local mock
OpenAI-compatible endpoint so it remains deterministic.

## Local Pi Harness Run

This live run succeeded locally with the Pi SDK and Anthropic `claude-haiku-4-5`:

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

Observed summary:

```json
{
  "run_id": "pi-decision-brief",
  "status": "succeeded",
  "provider": "pi",
  "plan_status": "ready",
  "outputs": ["evidence_map", "risk_register", "decision_brief"]
}
```

Trace summary:

```text
Run: pi-decision-brief
Component: inference-decision-brief [graph]
Status: succeeded (accepted)
Nodes:
- evidence-extractor: succeeded outputs[evidence_map]
- risk-synthesizer: succeeded outputs[risk_register]
- decision-brief-writer: succeeded outputs[decision_brief]
```

## Current Live Credential State

The available OpenRouter key reaches the provider but returns HTTP 402
insufficient credits. That is useful evidence: both the Pi OpenRouter path and
the direct OpenAI-compatible adapter surface the provider/account failure
clearly, without collapsing it into a missing-output runtime error.
