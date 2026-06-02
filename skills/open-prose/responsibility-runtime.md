---
role: responsibility-runtime-doctrine
summary: |
  How OpenProse serves standing goals by composing Responsibilities, Reactor,
  and Forme over the compile (intelligent) / run (dumb) split. Read this file for
  Responsibility Runtime, `kind: responsibility`, or standing-goal work. There is
  no judge beat, no status enum, no pressure, and no fulfillment activation: the
  reconciler decides skip-vs-render by comparing fingerprints.
see-also:
  - compiler/index.prose.md: Pinned compiler program (the language-layer compile steps)
  - compiler/ir-v0.md: Compiled intent output contract (topology + canonicalizers + validators)
  - concepts/responsibility.md: Responsibility semantic contract
  - concepts/reactor.md: Fingerprint-comparison reconciler + three wake sources
  - contract-markdown.md: Source format and recognized kinds
  - forme.md: Wiring as a compile-phase render producing the topology world-model
  - prose.md: Bounded render harness semantics
  - primitives/session.md: The render's harness contract
  - guidance/tenets.md: Design reasoning behind the specs
---

# Responsibility Runtime

OpenProse enables Responsibility-Oriented Architecture. It is not itself only a
Responsibility Runtime: many OpenProse programs are ordinary one-shot
`function` calls or standalone renders.

Responsibility-Oriented Architecture starts from responsibilities: standing
goals that must remain true over time. A `kind: responsibility` is a **mounted
node** — a declaration (`### Requires` → `### Maintains`) plus a render. Mounting
adds identity, a persisted world-model, and resolved subscriptions; it does not
intrude on the render atom, which runs standalone with no harness present.

The Responsibility Runtime is the served continuity layer that keeps those
standing goals maintained through bounded renders woken over time.

## The Two Phases

The spine is the **compile (intelligent) / run (dumb)** split. Intelligence
decides what counts as a change *once*, at compile time; determinism checks it
*every time*, at run time.

| Phase | When | Character | Produces |
|-------|------|-----------|----------|
| Compile | The contract set changes (operator / CI / watch) | Intelligent | The resolved DAG (Forme topology), per-node canonicalizers, per-node postcondition validators |
| Run | Every wake | Dumb | A `rendered` / `skipped` / `failed` receipt; on a moved fingerprint, propagation |

`prose compile` is the only special intelligent phase. Each compile step is
itself a render — it has a contract, produces a world-model, and signs a receipt,
so the compile output is auditable. Every wake at run time is an ordinary bounded
render; the reconciler around it is deterministic infrastructure.

Timers, source changes, upstream receipts, and manual requests are all events.
The runtime treats them as wakeups, not as reasons to keep one AI session alive
forever.

## Source And Compiled Intent

OpenProse preserves semantic Markdown as the authoring surface.

`prose compile` lowers `<openprose-root>/src/` into compiled intent. The
compiler is the bundled OpenProse program at `compiler/index.prose.md`: its
agents are **compile-step renders** — Forme (wiring), the canonicalizer compiler,
and the postcondition compiler. The SDK owns orchestration; the bundled compiler
narrows to language-layer compile steps. The output matches `compiler/ir-v0.md`:

- a **topology world-model** (`nodes` / `edges` / `entry_points` / `acyclic`) —
  Forme's output, the resolved subscription DAG
- per-node **canonicalizers** — `canonicalizer(world-model) → fingerprints`, plain
  deterministic code that travels with the compiled contract
- per-node **postcondition validators** — the `### Maintains` postconditions,
  deterministic-verify-on-commit where expressible, render-attested where semantic
- the frozen `contract_fingerprints`

There is **no** `activations` array, no `criteria`, no judge, and no per-system
`formeManifests` in the IR. Default compiler output lives under
`<openprose-root>/dist/`:

- `manifest.next.json`: the newly compiled intent
- `manifest.active.json`: the intent served by `prose serve`

`prose serve` loads compiled intent and acts like deterministic infrastructure:

- validate the active manifest
- register concrete cron and HTTP triggers (the topology's `entry_points`)
- accept HTTP trigger events quickly, then translate them into edge receipts
- run the reconciler: compare fingerprints, skip the unchanged, schedule, commit,
  propagate
- launch ordinary bounded renders and record operational metadata

The first live serve phase supports local cron and HTTP adapters. Queue,
file-watch, provider subscription, auth validation, and automatic manifest reload
remain later runtime phases.

Compiled intent is a disposable generated artifact. The Markdown source is the
durable intent.

The canonical maintained truth — each node's world-model — and the append-only
receipt ledger are the durable cross-run records. The **published** world-model
is fingerprinted; a render's private **workspace** scratch is never fingerprinted
and reaches the published artifact only through an explicit commit. SQL, vector
stores, and dashboards are **derived projections, never the truth**.

## Layer Boundaries

Markdown source defines intent:

- responsibility and gateway contracts (`### Requires` / `### Maintains` /
  `### Continuity`)
- `function` call interfaces (`### Parameters` / `### Returns`)
- optional fulfillment expressed as the render itself or a delegated `function`
- optional gateway ingress details when external inference is unsafe

Skill and interpreter docs define semantics:

- how responsibilities are read as mounted nodes
- how Reactor reconciles by comparing fingerprints across three wake sources
- how Forme wires the DAG from `Requires ↔ Maintains` matches
- how a bounded render reads prior world-model by reference and signs a receipt

The compiler program lowers semantics into compiled intent:

- discover source
- run the compile-step renders (Forme, canonicalizer, postconditions)
- report ambiguity and wiring diagnostics
- emit repository IR matching `compiler/ir-v0.md` under `<openprose-root>/dist/`

The harness serves compiled intent:

- load and validate the active manifest
- register concrete trigger adapters for the topology's entry points
- receive trigger events and translate them into wakes
- run the reconciler and launch ordinary bounded renders
- append receipts to the ledger; version the world-model store

Do not put semantic intelligence in the harness. Do not put runtime machinery
inside responsibility contracts. Do not duplicate concept semantics inside the
compiler program. **Do not reintroduce a judge in the wake or commit decision.**

## Runtime Commands

| Command | Role |
|---------|------|
| `prose compile [path] [--out <dir>]` | Run the bundled compiler program, emit topology + canonicalizers + validators, and validate the IR before success |
| `prose serve` | Load active compiled intent, register local cron and HTTP adapters, run the reconciler, and launch ordinary bounded renders |
| `prose run` | Execute one bounded render — standalone, or one wake of a mounted node |
| `prose status` | Report active IR, the topology, diagnostics, the trigger plan, and recent receipts |

Queues, file watches, provider subscription setup, webhook authentication, and
automatic manifest reload are not part of the v0 runtime surface.

`prose compile` is the only special intelligent phase. Triggered wakes are
ordinary OpenProse renders.

`prose status` is deterministic local inspection. It does not run a render,
register adapters, or infer new semantics; it reads compiled IR and the receipt
ledger so a developer can see what the runtime believes is active.

HTTP trigger adapters acknowledge accepted events before the downstream render
completes. Long-running AI work should not hold webhook callers open; render
failures belong in serve logs and the receipt ledger.

## Responsibilities

A `kind: responsibility` file is semantic and normative. It says what truth it
maintains (`### Maintains`, the world-model schema), what it subscribes to
(`### Requires`, naming facet-level needs), how it wakes (`### Continuity`), and
what must stay invariant.

Load `concepts/responsibility.md` before authoring, reviewing, or compiling a
responsibility.

`### Maintains` is the world-model schema and does four jobs at once: the type
(the fields, including freshness fields), the canonicalization spec (what is
material, how text/sets/numbers normalize), the optional facets (named
sub-truths for finer-grained propagation), and the postconditions (compiled to
validators). The folded-in `### Criteria` lives here as postconditions — **there
is no separate judge beat**.

Responsibilities declare host capabilities in `### Tools` when the render needs
connectors or CLIs for observation or actuation. Supported declarations are
`cli:<name>` and `mcp:<name>`; resolution is fail-closed and never installs or
contacts tools during compile. Resolved responsibility-level tools are carried in
repository IR and included in serve render payloads so the render binds the
declared capability set instead of re-reading or guessing from source.

Responsibility files do not directly define crons, listeners, queues, tests, or
implementation steps. The compiler infers concrete triggers and wiring when the
source graph is clear. Authors add optional `kind: gateway` files (sugar for an
external-driven responsibility) when inference would be unsafe, such as an
external webhook route or provider event shape.

## Reactor — The Dumb Reconciler

Reactor is the run-phase reconciler. It carries **no** judge, no status enum
(`up/drifting/down/blocked` is retired), no pressure record, and no fulfillment
activation. The loop:

1. A wake arrives as a **receipt** — from one of three sources: input-driven (an
   upstream receipt), self-driven (the node's continuity clock emits a synthetic
   self-receipt / tick), or external-driven (a gateway turns a webhook / cron /
   manual trigger into an edge receipt).
2. **Memo / skip.** The memo key is `(contract-fingerprint, input-fingerprints)`
   — nothing else. If neither half moved since the node's last receipt, write a
   cheap `skipped` receipt and spawn nothing.
3. **Single-flight + coalescing.** One render in flight per node; wakes arriving
   mid-render mark the node dirty and collapse into one follow-up render against
   the freshly-moved inputs.
4. **Render.** A bounded render reads its evidence and prior world-model by
   reference, leaves its `### Maintains` postconditions satisfied, writes the
   world-model, and signs a receipt with the fingerprints. It signals `rendered`
   (committed) or `failed` (nothing committed; prior truth stands). The harness
   never asks an LLM "did this change."
5. **Propagate.** On a `rendered` receipt whose fingerprint moved, wake the
   downstreams subscribed to the moved facet(s) — resolved by reading the
   topology world-model's edges. Only `rendered`-with-a-moved-fingerprint
   propagates; `skipped` and `failed` do not.

Load `concepts/reactor.md` before designing Responsibility Runtime behavior or
interpreting reconciler feedback.

### Freshness — State vs. Policy

Freshness *state* (`valid_until`, `last_corroborated`, `confidence`) lives **in
the world-model**; freshness *policy* (the recheck cadence) lives in
`### Continuity`. A `valid_until` lapsing flips a fact's status, which moves that
facet's fingerprint — so "time becoming material" is just another change that
propagates as surprise. For the silent-staleness case the move is triggered by
the self-driven tick (the deliberately-declared cadence).

## Forme In The Responsibility Runtime

Forme remains the single source of truth for wiring semantics. Compile does not
invent a second wiring language.

Forme is a **compile-phase render**: it reads all declared contracts,
semantically matches `Requires.<facet> ↔ Maintains.<facet>`, and emits the
resolved DAG as its own world-model — the **topology** (`nodes` / `edges` /
`entry_points` / `acyclic`). Acyclicity is a postcondition on Forme's own
`### Maintains`. No producer, or an ambiguous match, is a surfaced wiring
diagnostic, never a silent guess. The reconciler reads the topology's `edges` to
resolve propagation targets. Forme re-renders the topology when the contract set
changes. There is no per-system manifest; composition inside a node is imperative
ProseScript `call`, and the only cross-node connection is a subscription.

## Model Policy

Model choice for renders, compile steps, and the compiler is runtime or harness
policy. It is not part of the responsibility contract.

Responsibility source should remain portable across harnesses and models.
