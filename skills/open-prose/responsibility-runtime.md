---
role: responsibility-runtime-doctrine
summary: |
  How OpenProse enables Responsibility-Oriented Architecture by composing
  Responsibilities, Reactor, Forme, compile, serve, run, and status. Read this
  file for Responsibility Runtime, `kind: responsibility`, or standing-goal
  work.
see-also:
  - compiler/README.md: Compiler program index and compiled intent output convention
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
- `manifest.active.json`: the manifest served by later runtime phases

`prose serve` loads compiled intent and acts like deterministic infrastructure:

- validate the active manifest
- prepare the static trigger registration plan
- resolve events to activations
- launch normal bounded `prose run` sessions
- record operational metadata

The first serve phase should not add production flags only to simulate trigger
delivery. Test event-to-activation resolution directly, then add live timer,
webhook, queue, and file-watch adapters in a later runtime phase.

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
- explicit connector details only when inference is unsafe

Skill and interpreter docs define semantics:

- how responsibilities are read
- how Reactor reconciles status and pressure
- how Forme wiring fulfills responsibilities
- how bounded runs act on activation context

Compiler programs lower semantics into compiled intent:

- discover source
- compile responsibilities, trigger intent, activations, and Forme manifests
- report ambiguity and warnings
- emit deterministic output for harness validation under `<openprose-root>/dist/`

The harness serves compiled intent:

- load and validate the active manifest
- prepare trigger registration plans
- receive events when live adapters are available
- launch normal runs
- store run, activation, status, and pressure records

Do not put semantic intelligence in the harness. Do not put runtime machinery
inside responsibility contracts. Do not duplicate concept semantics inside
compiler passes.

## Runtime Commands

These commands describe the Responsibility Runtime direction. A host may not
implement all of them yet.

| Command | Role |
|---------|------|
| `prose compile [path] [--out <dir>]` | Run the bundled compiler program and emit compiled intent |
| `prose serve` | Load active compiled intent and prepare the trigger registration plan; live adapters register and receive events in later runtime phases |
| `prose run` | Execute one bounded service, system, judge, or fulfillment activation |
| `prose status` | Report recent runs, activations, diagnostics, and responsibility status |

`prose compile` is the only special intelligent phase. Triggered activations
are ordinary OpenProse runs.

## Responsibilities

A `kind: responsibility` file is semantic and normative. It says what must stay
true, how time matters, what satisfactory fulfillment looks like, and what
must remain bounded or prohibited.

Load `concepts/responsibility.md` before authoring, reviewing, or compiling a
responsibility.

Responsibility files do not directly define crons, listeners, queues, tests, or
implementation steps. The compiler infers trigger intent and fulfillment when
the source graph is clear. Authors add explicit connector details only when
inference would be unsafe, such as an external webhook route or provider event
shape.

## Reactor

Reactor is the maintenance loop:

1. An event arrives or a responsibility becomes due.
2. A bounded judge activation computes status.
3. Status is recorded as `up`, `drifting`, `down`, or `blocked`.
4. Unhealthy status produces pressure.
5. Pressure activates fulfillment, retry, or escalation.

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
