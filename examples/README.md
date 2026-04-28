# OpenProse North-Star Examples

This package exercises the OpenProse runtime. The examples are not syntax
snippets; they are small company operating workflows:

- typed props flow from upstream materialized runs into downstream graph nodes
- only selected stale nodes execute
- every executed graph node maps to a persisted Pi session
- policy gates block before a session starts
- memory and scratch mutations are modeled as explicit effects
- package metadata advertises the graph VM separately from model providers

The package root stays at `examples/` so registry and publish commands remain
short. Source contracts live under `examples/north-star/`.
Fixture inputs live beside them under `examples/north-star/fixtures/`; each
fixture filename maps back to a declared example input.

## Ladder

| Tier | Example | Capability Pressure |
| --- | --- | --- |
| Smoke | [`company-signal-brief`](north-star/company-signal-brief.prose.md) | a single useful typed service |
| Runtime | [`lead-program-designer`](north-star/lead-program-designer.prose.md) | selective recompute over typed upstream artifacts |
| Runtime | [`stargazer-intake-lite`](north-star/stargazer-intake-lite.prose.md) | memory, high-water marks, and idempotent replay |
| Showcase | [`opportunity-discovery-lite`](north-star/opportunity-discovery-lite.prose.md) | fan-out/fan-in ranking and dedupe |
| Runtime | [`release-proposal-dry-run`](north-star/release-proposal-dry-run.prose.md) | pre-session human gates for effecting work |
| Showcase | [`customer-repo-scaffold-preview`](north-star/customer-repo-scaffold-preview.prose.md) | controlled scratch mutation and multi-file previews |
| Showcase | [`agent-ecosystem-index-refresh`](north-star/agent-ecosystem-index-refresh.prose.md) | per-node model routing intent under the Pi graph VM |
| Runtime | [`merged-pr-fit-review-lite`](north-star/merged-pr-fit-review-lite.prose.md) | prior-run memory reuse and parallel review fan-in |

## Package Checks

```bash
bun run prose package examples --format json
bun run prose publish-check examples --strict
```

## Fixture Corpus

Fixtures use the pattern
`examples/north-star/fixtures/<example>/<scenario>.<input>.(json|md)`.
The corpus covers happy paths, stale-input recompute pressure, duplicate rows,
gated release cases, no-op release cases, and seeded-bad inputs.

## Eval Rubrics

Each example has a paired eval contract in `examples/evals/north-star/`. The
rubrics define the expected subject run shape, what good output includes, what
must be rejected, and the assertions executable evals enforce.

## Scripted Pi Scenarios

The test suite runs every north-star example through a scripted Pi-shaped
session that calls `openprose_submit_outputs`. These are deterministic tests of
the real graph runtime contract: output files are fallback behavior, while the
north-star scenarios exercise the structured tool path that live Pi sessions
should use.

## Release Backpressure

The examples participate in the release gate:

```bash
bun run measure:examples
bun run confidence:runtime
bun run smoke:live-pi
```

`measure:examples` records package quality, selective recompute savings,
approval visibility, and baseline skill-folder comparison. `confidence:runtime`
runs the public CLI across compile, plan, run, inspect, package, install, and
publish-check. `smoke:live-pi` is skipped by default and becomes the opt-in
rung for real Pi SDK and model-provider interop.

If a runtime change weakens typed props, node sessions, approval gates,
structured output submission, or package metadata, this suite fails.

## Smallest Run

```bash
bun run prose run examples/north-star/company-signal-brief.prose.md \
  --run-root /tmp/openprose-north-star/runs \
  --run-id company-signal-brief \
  --input signal_notes="Customer teams want agent workflows that survive handoffs." \
  --input brand_context="OpenProse is React for agent outcomes." \
  --output company_signal_brief="OpenProse should lead with durable agent workflows." \
  --no-pretty
```

## Human Gate Smoke

Without approvals, effecting release work blocks before Pi starts:

```bash
bun run prose plan examples/north-star/release-proposal-dry-run.prose.md \
  --input release_candidate=v0.11.0
```

With explicit approval scopes, the dry-run can materialize:

```bash
bun run prose run examples/north-star/release-proposal-dry-run.prose.md \
  --run-root /tmp/openprose-north-star/runs \
  --run-id release-proposal-dry-run \
  --input release_candidate=v0.11.0 \
  --approved-effect human_gate \
  --approved-effect delivers \
  --output 'release-decision-check.release_decision={"release_required":true,"status":"ready_for_approval","gate_required":true}' \
  --output qa-check.qa_report="QA report." \
  --output release-note-writer.release_summary="Release notes." \
  --output announce-release.delivery_receipt="Delivered to #releases." \
  --no-pretty
```
