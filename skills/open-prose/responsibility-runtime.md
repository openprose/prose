---
role: responsibility-runtime-doctrine
summary: |
  How OpenProse enables Responsibility-Oriented Architecture by composing
  Responsibilities, Reactor, Forme, compile, serve, run, and status. Read this
  file for Responsibility Runtime, `kind: responsibility`, or standing-goal
  work.
see-also:
  - compiler/index.prose.md: Pinned compiler program
  - compiler/ir-v0.md: Compiled intent output contract
  - concepts/responsibility.md: Responsibility semantic contract
  - concepts/reactor.md: Evented reconciliation model
  - contract-markdown.md: Source format and recognized kinds
  - forme.md: Fulfillment wiring semantics
  - prose.md: Bounded VM run semantics
  - guidance/tenets.md: Design reasoning behind the specs
---

# Responsibility Runtime

OpenProse enables Responsibility-Oriented Architecture. It is not itself only
a Responsibility Runtime: many OpenProse programs are ordinary one-shot
services, composed systems, tests, or patterns.

Responsibility-Oriented Architecture starts from responsibilities: standing
goals that must remain true over time.

A Responsibility Runtime is the served continuity layer that keeps those
standing goals checked, maintained, and restored through bounded OpenProse
runs.

## Runtime Stack

Responsibilities, Reactor, and Forme are not competing frameworks.

| Layer | Role |
|-------|------|
| Responsibility | Standing goal: what must remain true over time |
| Reactor | Evented reconciliation model: when and why the invariant is checked or acted on |
| Forme | Fulfillment wiring: which services and systems can restore or maintain the invariant |
| Prose VM | Bounded activation: one run that judges, fulfills, retries, or escalates |

Timers, webhooks, queues, file changes, source changes, judge drift, and
manual requests are all events. The runtime should treat them as wakeups, not
as reasons to keep one AI session alive forever.

## Source And Compiled Intent

OpenProse preserves semantic Markdown as the authoring surface.

`prose compile` lowers `<openprose-root>/src/` into compiled intent. The
compiler is the bundled OpenProse program at `compiler/index.prose.md`: it
reads the source graph, applies the concept docs, and emits deterministic
manifests for the harness to validate and serve.

Default compiler output lives under `<openprose-root>/dist/`:

- `manifest.next.json`: the newly compiled manifest
- `manifest.active.json`: the manifest served by `prose serve`

`prose serve` loads compiled intent and acts like deterministic infrastructure:

- validate the active manifest
- register concrete cron and HTTP triggers
- resolve events to activations
- launch normal bounded `prose run` sessions
- record operational metadata

The first live serve phase supports local cron and HTTP adapters. Queue,
file-watch, provider subscription, auth validation, and automatic manifest
reload remain later runtime phases.

Compiled intent is a disposable generated artifact. The Markdown source is the
durable intent.

Responsibility status, pressure, and other durable cross-run records live under
`<openprose-root>/state/responsibilities/`. Agent memory that must survive
activations lives under `<openprose-root>/state/agents/`.

## Layer Boundaries

Markdown source defines intent:

- service and system contracts
- responsibility promises
- optional fulfillment hints
- optional gateway ingress details when inference is unsafe

Skill and interpreter docs define semantics:

- how responsibilities are read
- how Reactor reconciles status and pressure
- how Forme wiring fulfills responsibilities
- how bounded runs act on activation context

The compiler program lowers semantics into compiled intent:

- discover source
- compile responsibilities, gateways, concrete triggers, activations, and
  Forme manifests
- report ambiguity and warnings
- emit repository IR matching `compiler/ir-v0.md` under
  `<openprose-root>/dist/`

The harness serves compiled intent:

- load and validate the active manifest
- register concrete trigger adapters
- receive trigger events
- launch normal runs
- store run, activation, status, and pressure records

Do not put semantic intelligence in the harness. Do not put runtime machinery
inside responsibility contracts. Do not duplicate concept semantics inside the
compiler program.

## Runtime Commands

| Command | Role |
|---------|------|
| `prose compile [path] [--out <dir>]` | Run the bundled compiler program, emit compiled intent, and validate it before success |
| `prose serve` | Load active compiled intent, register local cron and HTTP adapters, and launch ordinary bounded activations |
| `prose run` | Execute one bounded service, system, judge, or fulfillment activation |
| `prose status` | Report active IR, diagnostics, trigger plan, recent runs, and responsibility status/pressure |

Queues, file watches, provider subscription setup, webhook authentication, and
automatic manifest reload are not part of the v0 runtime surface.

`prose compile` is the only special intelligent phase. Triggered activations
are ordinary OpenProse runs.

Judge activations use the bundled `runtime/judge-responsibility.prose.md`
service unless a later runtime phase introduces custom judge routing. The
service writes `latest.json` and appends `status.jsonl` under
`<openprose-root>/state/responsibilities/{responsibility-id}/`.

Unhealthy judge status can produce a narrow pressure record under the same
responsibility directory. Pressure is deduped by responsibility fingerprint,
status, source status timestamp, activation class, and activation id, then
launched as a normal bounded fulfillment, retry, or escalation activation.

`prose status` is deterministic local inspection. It does not run the VM,
register adapters, or infer new semantics; it reads compiled IR and runtime
receipts so a developer can see what the runtime believes is active.

## Responsibilities

A `kind: responsibility` file is semantic and normative. It says what must stay
true, how time matters, what satisfactory fulfillment looks like, and what
must remain bounded or prohibited.

Load `concepts/responsibility.md` before authoring, reviewing, or compiling a
responsibility.

Responsibility files do not directly define crons, listeners, queues, tests, or
implementation steps. The compiler infers concrete triggers and fulfillment
when the source graph is clear. Authors add optional `kind: gateway` files when
inference would be unsafe, such as an external webhook route or provider event
shape.

## Reactor

Reactor is the maintenance loop:

1. An event arrives or a responsibility becomes due.
2. A bounded judge activation computes status.
3. Status is recorded as `up`, `drifting`, `down`, or `blocked`.
4. Unhealthy status produces pressure.
5. Pressure activates fulfillment, retry, or escalation through ordinary
   `prose run` semantics.

Load `concepts/reactor.md` before designing Responsibility Runtime behavior or
interpreting maintenance feedback.

## Forme In The Responsibility Runtime

Forme remains the single source of truth for service and system wiring
semantics. Compile does not invent a second wiring language.

During compile, Forme source is lowered into structured Forme manifest JSON so
activation-time runs do not need to re-discover dependencies. This JSON object
is the canonical wiring contract. A host may render it for inspection, but a
separate Markdown run manifest is not required. During serve, the harness loads
the compiled manifest and passes the right activation context into ordinary
`prose run` sessions.

## Model Policy

Model choice for judges, fulfillment, and compilation is runtime or harness
policy. It is not part of the responsibility contract.

Responsibility source should remain portable across harnesses and models.
