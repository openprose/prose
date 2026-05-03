---
role: native-runtime-doctrine
summary: |
  How OpenProse Native Repositories compose Responsibilities, Reactor,
  Forme, compile, serve, run, and status. Read this file for company
  operations-as-code, `kind: responsibility`, or native repository work.
see-also:
  - concepts/responsibility.md: Responsibility semantic contract
  - concepts/reactor.md: Evented reconciliation model
  - contract-markdown.md: Source format and recognized kinds
  - forme.md: Fulfillment wiring semantics
  - prose.md: Bounded VM run semantics
  - guidance/tenets.md: Design reasoning behind the specs
---

# Native Runtime Doctrine

An OpenProse Native Repository models operations as durable intent. It does
not model a company primarily as employees, roles, departments, or workflows.
It models the company as responsibilities: goals that must remain true over
time.

## Runtime Stack

Responsibilities, Reactor, and Forme are not competing frameworks.

| Layer | Role |
|-------|------|
| Responsibility | Durable invariant: what must remain true over time |
| Reactor | Evented reconciliation model: when and why the invariant is checked or acted on |
| Forme | Fulfillment wiring: which services and systems can restore or maintain the invariant |
| Prose VM | Bounded activation: one run that judges, fulfills, retries, or escalates |

Timers, webhooks, queues, file changes, source changes, judge drift, and
manual requests are all events. The runtime should treat them as wakeups, not
as reasons to keep one AI session alive forever.

## Source And IR

OpenProse preserves semantic Markdown as the authoring surface.

`prose compile` lowers that source into repository IR. The compiler is an
OpenProse program that reads the source graph, applies the concept docs, and
emits deterministic manifests for the harness to validate and serve.

`prose serve` loads compiled IR and acts like deterministic infrastructure:

- validate the active manifest
- register triggers
- receive events
- map events to activations
- launch normal bounded `prose run` sessions
- record operational metadata

The IR is disposable generated state. The Markdown source is the durable
intent.

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

Compiler programs lower semantics into IR:

- discover source
- compile responsibilities, trigger intent, activations, and Forme manifests
- report ambiguity and warnings
- emit deterministic output for harness validation

The harness serves IR:

- load and validate the active manifest
- register triggers
- receive events
- launch normal runs
- store run, activation, status, and pressure records

Do not put semantic intelligence in the harness. Do not put runtime machinery
inside responsibility contracts. Do not duplicate concept semantics inside
compiler passes.

## Native Repository Commands

These commands describe the native runtime direction. A host may not implement
all of them yet.

| Command | Role |
|---------|------|
| `prose compile` | Run the bundled compiler program and emit repository IR |
| `prose serve` | Load IR, register triggers, receive events, and launch activations |
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

Load `concepts/reactor.md` before designing native runtime behavior or
interpreting maintenance feedback.

## Forme In The Native Runtime

Forme remains the single source of truth for service and system wiring
semantics. Native compile does not invent a second wiring language.

During compile, Forme source is lowered into full runnable Forme manifests so
activation-time runs do not need to re-discover dependencies. During serve,
the harness loads those manifests and passes the right activation context into
ordinary `prose run` sessions.

## Model Policy

Model choice for judges, fulfillment, and compilation is runtime or harness
policy. It is not part of the responsibility contract.

Responsibility source should remain portable across harnesses and models.
