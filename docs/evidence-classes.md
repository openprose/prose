# Evidence Classes

OpenProse launch evidence has separate classes. Cite each class for the behavior
it covers.

| Evidence Class | Required Locally | Spends Inference | Covers | Does Not Cover |
| --- | --- | --- | --- | --- |
| Deterministic fixtures | yes | no | source, compiler, planner, eval, and package behavior are stable | real model output quality |
| Scripted Pi runs | yes | no | OpenProse graph VM, node sessions, output submission, artifacts, traces, and selective recompute work through the Pi-shaped contract | provider auth, billing, latency, or model reliability |
| Binary cold-start | yes | no | the publishable binary package can run outside the source checkout | registry publish/download behavior |
| Agent onboarding | yes | no | a coding agent can follow the first operator loop and validate the package without private context | long-horizon agent productivity |
| Live Pi smoke | no | yes | Pi SDK, model-provider profile, auth, timeout, and structured output interop work against real inference | deterministic release safety by itself |
| Hosted dev smoke | no for OSS, yes for platform launch gates | yes | Fly API, Postgres, Tigris, Sprites, OpenRouter, package registry, deployment, and run inspection interoperate | production readiness or customer RBAC depth |

## Reporting Rule

Use deterministic fixtures, scripted Pi runs, cold-start, and agent onboarding
as required local release confidence.

Use live Pi and hosted dev smokes as interop evidence. They are opt-in and
environment-sensitive; cite date, model, provider, and run context.

## Generated Sources

- [`measurements/latest.md`](measurements/latest.md)
- [`measurements/runtime-confidence.latest.md`](measurements/runtime-confidence.latest.md)
- [`measurements/cold-start.latest.md`](measurements/cold-start.latest.md)
- [`measurements/agent-onboarding.latest.md`](measurements/agent-onboarding.latest.md)
- [`measurements/live-pi.latest.md`](measurements/live-pi.latest.md)
- [`measurements/launch-evidence.latest.md`](measurements/launch-evidence.latest.md)
