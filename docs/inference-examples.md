# Inference Examples

OpenProse has one real local graph runtime:

- `pi`: a harness-backed graph VM. It runs one persisted Pi session for each
  selected graph node, writes or submits declared output artifacts, and lets
  OpenProse materialize those artifacts as runs.

OpenProse is the meta-harness. It plans the graph, invokes Pi sessions for the
selected nodes, validates outputs, stores artifacts, and passes accepted
upstream artifacts downstream. Model providers such as OpenRouter are configured
inside the Pi runtime profile; they are not OpenProse graph VMs.

## Lead Program Designer

[`examples/north-star/lead-program-designer.prose.md`](../examples/north-star/lead-program-designer.prose.md)
is the first compact model-backed graph in the north-star ladder. It turns a
lead profile and brand context into:

- `lead_normalized_profile`
- `lead_qualification_score`
- `lead_program_plan`

The graph is deliberately inspectable:

1. `lead-profile-normalizer` receives the raw lead profile.
2. `lead-qualification-scorer` receives the accepted normalized profile.
3. `save-grow-program-drafter` receives the normalized profile, score, and
   brand context.

Changing only `brand_context` should re-run the drafter while reusing the
normalizer and scorer. That is the "React for agent outcomes" pressure this
example exists to keep honest.

## Local Pi Run With OpenRouter

Use this when you have a funded OpenRouter key:

```bash
OPENPROSE_PI_MODEL_PROVIDER=openrouter \
OPENPROSE_PI_MODEL_ID=google/gemini-3-flash-preview \
OPENPROSE_PI_API_KEY="$OPENROUTER_API_KEY" \
OPENPROSE_PI_THINKING_LEVEL=low \
bun run prose run examples/north-star/lead-program-designer.prose.md \
  --provider pi \
  --run-root /tmp/openprose-live-inference/runs \
  --run-id openrouter-pi-lead-program \
  --input lead_profile='{"company":"Acme Robotics","pain":"manual handoffs between AI pilots and production workflows","buyer":"VP Operations"}' \
  --input brand_context="OpenProse helps teams turn agent workflows into typed, reactive, auditable software."
```

The repository test suite keeps deterministic coverage with scripted Pi
sessions while live runs exercise the real harness boundary.

## Live Pi Smoke Ladder

Use the smoke ladder when you want to exercise the real Pi SDK boundary without
turning live inference into a required local test.

```bash
OPENPROSE_LIVE_PI_SMOKE=1 \
OPENPROSE_PI_API_KEY="$OPENROUTER_API_KEY" \
bun run smoke:live-pi -- --tier cheap
```

Tiers:

- `cheap`: `company-signal-brief`, one Pi session over caller-provided notes
- `medium`: `lead-program-designer`, three Pi node sessions with upstream
  artifact handoff
- `complex`: `stargazer-intake-lite`, five Pi node sessions with
  `writes_memory` approval
- `all`: runs all three tiers in order

Defaults:

- model provider: `openrouter`
- model: `google/gemini-3-flash-preview`
- output: `docs/measurements/live-pi.latest.json` and
  `docs/measurements/live-pi.latest.md`

Useful overrides:

```bash
OPENPROSE_LIVE_PI_MODEL_ID=openai/gpt-5.5 \
OPENPROSE_LIVE_PI_THINKING_LEVEL=medium \
OPENPROSE_LIVE_PI_TIMEOUT_MS=240000 \
bun run smoke:live-pi -- --tier all --run-root /tmp/openprose-live-pi/runs
```

The script skips cleanly unless `OPENPROSE_LIVE_PI_SMOKE=1` or `--enable` is
set. Missing auth is reported as `auth_missing` before any Pi session starts.

## Expected Trace Shape

```text
Run: openrouter-pi-lead-program
Component: lead-program-designer [graph]
Status: succeeded (accepted)
Nodes:
- lead-profile-normalizer: succeeded outputs[lead_normalized_profile]
- lead-qualification-scorer: succeeded outputs[lead_qualification_score]
- save-grow-program-drafter: succeeded outputs[lead_program_plan]
```
