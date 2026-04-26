# Inference Examples

OpenProse has one real local graph runtime:

- `pi`: a harness-backed graph VM. It runs one persisted Pi session for each
  selected graph node, writes or submits declared output artifacts, and lets
  OpenProse materialize those artifacts as runs.

OpenProse is the meta-harness. It plans the graph, invokes Pi sessions for the
selected nodes, validates structured output submissions, stores artifacts, and
passes accepted upstream artifacts downstream. Model providers such as
OpenRouter are configured inside the Pi runtime profile; they are not OpenProse
graph VMs.

Single-run harnesses can still be useful for one-off execution. They are not
the reactive graph VM. Multi-node OpenProse graphs use Pi node sessions because
the runtime needs durable inter-run coordination, dependency-ordered execution,
artifact handoff, effect gates, and traceable materialization.

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
  --graph-vm pi \
  --run-root /tmp/openprose-live-inference/runs \
  --run-id openrouter-pi-lead-program \
  --input lead_profile='{"company":"Acme Robotics","pain":"manual handoffs between AI pilots and production workflows","buyer":"VP Operations"}' \
  --input brand_context="OpenProse helps teams turn agent workflows into typed, reactive, auditable software."
```

The repository test suite keeps deterministic coverage with scripted Pi
sessions while live runs exercise the real harness boundary.

## Hosted-Compatible Remote Execution

`prose remote execute` emits the host-ingestion envelope and artifact manifest.
It uses the same runtime vocabulary as `prose run`:

- deterministic `--output` values run through the internal scripted Pi session
  used by contract tests
- real remote workers can pass `--graph-vm pi` and configure model providers
  through the Pi runtime profile environment

That keeps the hosted boundary honest: remote workers get a stable envelope
without turning hosted execution into a second runtime model.

When a host captures worker logs, it can pass stdout/stderr content to the
remote envelope writer. Deterministic local fixtures leave those artifacts
empty; hosted workers should fill them with host logs while OpenProse traces
remain the canonical runtime timeline.

## Structured Output Tool

Live and scripted Pi sessions are expected to submit declared outputs through
`openprose_submit_outputs`. File outputs remain useful for scratch artifacts and
fallback development paths, but the north-star runtime contract is tool-first:

- OpenProse tells the node which typed outputs it must produce.
- Pi calls the output tool with those outputs.
- OpenProse validates required outputs before accepting the node run.
- Accepted outputs become upstream artifacts for later graph nodes.

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

When using OpenRouter, the smoke script writes a temporary Pi `models.json`
under `.prose/live-pi-agent/` for the selected model. This keeps live smoke
testing independent of how quickly Pi's bundled model registry learns new
OpenRouter model IDs.

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
