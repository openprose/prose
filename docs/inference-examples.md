# Inference Examples

OpenProse has one real local graph runtime:

- `pi`: a harness-backed graph VM. It runs a real agent harness session for
  each selected graph node, writes declared output artifacts, and lets
  OpenProse materialize those artifacts as runs.

OpenProse is the meta-harness. It plans the graph, invokes one Pi session per
selected node, validates outputs, stores artifacts, and passes accepted
upstream artifacts downstream. Model providers such as OpenRouter are configured
inside the Pi runtime profile; they are not OpenProse graph VMs.

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

## Local Pi Run With OpenRouter

Use this when you have a funded OpenRouter key:

```bash
OPENPROSE_PI_MODEL_PROVIDER=openrouter \
OPENPROSE_PI_MODEL_ID=google/gemini-3-flash-preview \
OPENPROSE_PI_API_KEY="$OPENROUTER_API_KEY" \
OPENPROSE_PI_THINKING_LEVEL=low \
bun run prose run examples/inference-decision-brief.prose.md \
  --provider pi \
  --run-root /tmp/openprose-live-inference/runs \
  --run-id openrouter-pi-decision-brief \
  --input decision_question="Should OpenProse prioritize a hosted registry before a hosted runtime?" \
  --input raw_signals="Registry package metadata is stable locally. Runtime provider interop still has risk. Users can already publish, install, test, and compose package components locally."
```

The repository test suite keeps deterministic coverage with scripted outputs
while the Pi integration tests exercise the real harness boundary.

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
insufficient credits. That is useful evidence: the Pi OpenRouter profile
surfaces provider/account failure clearly, without collapsing it into a
missing-output runtime error.
