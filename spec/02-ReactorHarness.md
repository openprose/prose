# OpenProse Reactor Harness

###### A Reactor-class harness for evented reconciliation of AI-maintained world state.

The OpenProse corpus divides labor exactly, and each document maps to what
ships:

- [01-Language.md](./01-Language.md) — **the Language & Framework**, bundled as
  the **SKILL**: syntax, kinds, sections, compile model, std/co, CLI surface.
- [02-ReactorHarness.md](./02-ReactorHarness.md) — **this
  document, the Reactor Harness**, bundled as the **CLI/Server**: the runtime
  control architecture — the loop, invariants, the reconciler, memoization, forecast,
  receipts, composition. It names the architectural class underneath
  continuous outcomes and answers _what the runtime must do_.
- [03-ReactorPattern.md](./03-ReactorPattern.md) — **the
  Reactor-Native Authoring Pattern**, **SKILL-bundled but harness-governed**:
  how to write `*.prose.md` so this harness's mechanisms engage. It bridges
  the Language doc and this doc.
- [ReactorFeedback.md](../history/ReactorFeedback.md) — **the
  decision log**, not shipped: the dialectic that produced this revision. This
  document is the clean statement and does not carry the dialectic.
- [00-Tenets.md](./00-Tenets.md) — **the constitution**. When any
  document tensions with a tenet, the tenet wins.

`ContinuousOutcomes.md` is out-of-scope ideation, not part of the runtime spec.

This file has three parts:

1. The ideal Reactor-class harness.
2. What exists today: the shipped `@openprose/reactor` SDK and
   `@openprose/reactor-cli`, measured honestly against the ideal.
3. What is next before OpenProse should publicly launch the term with a
   technical report.

---

## I. Ideal Reactor-Class Harness

### What it is like to use one

Start from the lived loop, not the machinery. The architecture is the
consequence of this promise, not the thing itself.

> You write one sentence of durable intent and what makes it true. Then you
> walk away — there is no session to babysit. The system interrupts you on
> exactly two conditions: it needs a judgment only a human can make, or an
> input or permission only you can grant. Otherwise it is silent. Everything it
> did, you can verify afterward from a trail you never had to ask for — and you
> can take that trail and that sentence and run them somewhere else.

Four beats: **author**, **walk away**, **interrupted only when genuinely
needed**, **verifiable and exitable trail**.

One honesty note belongs in the promise itself: interruptions **front-load
during authoring and asymptote toward silence**. "Walk away" is the steady
state, not the first hour. Saying so is what makes the rest credible — a
contract is at its most ambiguous the moment it is written, and the system's
most valuable early output is often "this sentence is not yet decidable, here
is why."

Everything below is the answer to a single question asked of each beat: _what
does this beat require the runtime to do?_

### The responsibility

A responsibility is a standing goal, written as durable intent. It is not a
task, script, or single run. It is a statement that should remain true:

```text
The release candidate is ready to ship.
Important customer risks are surfaced before renewal meetings.
The incident channel has a current, accurate briefing.
Compliance evidence is fresh enough for the next audit.
```

The contract is authored in `*.prose.md` per `00-Tenets.md` Tenet 1.
Nothing else carries semantic weight; compiled IR, projections, and read models
are derived views.

### The canonical loop

Each event is a reason to reconcile the modeled world state. An event may be a
timer tick, webhook, queue message, file change, source change, manual request,
an upstream node's new receipt, or a freshness lapse.

```text
event (a receipt arrives)
  -> the reconciler compares (contract_fingerprint, input_fingerprints)
  -> unmoved: write a cheap `skipped` receipt, render nothing
  -> moved: spawn one bounded render session -> gateCommit -> sign a receipt
  -> propagate: a moved fingerprint wakes the downstream subscribers
```

The harness is "Reactor-class" when that reconcile decision is **deterministic,
replayable, and identical on every host**: the intelligence that decides *what
counts as a change* is frozen ahead of time, at compile, into the per-node
canonicalizer, and the run-phase decision is a dumb fingerprint comparison — no
judge re-deciding at wake time. The model renders inside bounded activations;
continuity lives in the durable receipt trail, never in a long-running session.

The distinction from a normal agent loop is the whole point.

A normal agent loop asks:

```text
What should I do next?
```

A Reactor-class harness asks:

```text
Given this responsibility and the receipt that just woke it, did any fingerprint
it depends on actually move — and if so, what is the smallest render that makes
its truth current again?
```

That turns agent behavior from a running conversation into an inspectable state
transition.

### The unification thesis

The loop above is the **base case**. The full architecture is one mechanism
applied recursively:

> **A render is a pure step `(contract, evidence, prior world-model) → (new
> world-model, signed receipt)`. Everything else — composition, freshness, even
> the topology itself — is that same render, applied again.**

This single mechanism, seen from different sides, is the whole of Part I.
Two recursions wrap the base case:

- **World-models all the way down.** A node's truth is a world-model; a render
  computes the next one and signs a receipt. A consumer's render takes *upstream
  receipts* as part of its evidence, so a graph of responsibilities is just
  renders feeding renders. "B depends on A" means B's render consumes A's latest
  receipt, identical to consuming a webhook. **The dependency graph is the
  evidence graph.** The single-responsibility loop is the N=1 case.

- **The fixpoint.** The compile phase that wires the graph — Forme matching
  `### Requires` to `### Maintains` — is *itself* a render: it takes the contract
  set as evidence and maintains a topology as its truth. So the topology is a
  responsibility like any other, memoized on the contract-set fingerprint and
  re-rendered only when a contract changes. This closing recursion — the system
  maintaining its own wiring — is the end state that most proves the thesis; it
  is specified here and deferred past v1.

You do not need to re-understand the core loop. You need to understand that it
is the base case of these two recursions: one render atom, applied to a truth, to
a graph of truths, and finally to its own topology. Everything else is
presentation.

> **A path considered and set aside.** An earlier design made the *control
> policy* (cadence, hysteresis bands, escalation thresholds) a second
> model-authored artifact — compiled to a token-free registry and re-compiled
> continuously whenever a Popperian *falsification predicate* tripped, guarded by
> a deterministic kernel with rollback-to-last-known-good. That "two compiles"
> model (a source-compile plus a profile-guided *policy-compile*) was retired in
> favor of the simpler split below: intelligence is frozen **once** at compile
> into the canonicalizer, the topology, and the postcondition validators, and the
> run phase is a dumb reconciler with no policy to re-optimize. The adaptive-policy
> idea is recorded here as a deliberately-dropped path, not a roadmap item.

### The compile phase

OpenProse compiles **once per contract change** — compile is the rarest event in
the system, not a continuous loop. Compilation is intelligent model work that
emits three deterministic, replayable artifacts the run phase consumes:

| Compile output | What it is | What the model decides |
| --- | --- | --- |
| **Topology** (Forme) | the subscription DAG: which `### Requires` facet binds to which `### Maintains` facet | how the contracts wire together; that the graph is acyclic |
| **Canonicalizer** (per node) | the deterministic fingerprint function over a node's `### Maintains` | which fields are material, how text/sets/numbers normalize, where the facet boundaries fall |
| **Postcondition validators** (per node) | the deterministic checks `gateCommit` runs before a commit | what must hold for a render's output to be admissible |

Each compile *step* is itself a render with its own receipt, so a compile is
auditable and replayable like any other run. The output is a static IR consumed
and validated by deterministic code: **the language is never on the execution or
safety path** — a model authors the IR, code validates it, and the dumb
reconciler executes it. This is the same safe pattern throughout: a model
authors, the CLI validates, the reconciler runs.

Compile re-fires only when the **contract-set fingerprint** moves — an author
changed intent. A quiet contract set compiles zero times for as long as it stays
quiet; the IR is byte-identical across that whole window. There is no second,
receipt-history-driven compile: nothing re-optimizes a control policy at runtime,
because there is no control policy to optimize (see *A path considered and set
aside*, above). The only thing that re-fingerprints between source edits is the
world the contracts observe — and that drives **renders**, never recompiles.

### Quiescence

The headline behavior, and the clearest proof of the thesis:

> A normal agent loop's cost scales with wall-clock time. A Reactor's cost
> scales with **surprise**: for every token, you can name the change that
> justified it.

Quiescence is not the absence of behavior; it is three explicit behaviors,
ordered by how much they save:

1. **Don't act.** Nothing the node subscribes to moved, so it writes a cheap
   `skipped` receipt and renders nothing. The trivial case.
2. **Don't check now.** each self-driven facet carries a `valid_until`;
   until the soonest one lapses, the node sleeps. Provable quiescence is genuinely
   zero tokens on a static world. (= don't re-render until a dependency changes or freshness
   lapses.)
3. **Don't re-render the whole graph.** When a fingerprint does move, only the
   subtree that subscribes to it wakes; the rest stays asleep. (= reconcile the
   changed region, not the tree.)

The rigorous core is **memoization**: a render is keyed by
`(contract_fingerprint, input_fingerprints)` — the node's own contract plus the
fingerprints of every facet it subscribes to. Unchanged key → the render is
skipped at zero token cost, `React.memo` semantics applied to a bounded LLM
session. The key contains **nothing else**: no judge verdict, no policy artifact,
no confidence score. What "counts as a change" was decided once, at compile, by
the canonicalizer; the run phase only compares.

**Completeness is a compile-time property, not a runtime audit.** A memo key is
only safe if it captures every input that could change the truth — the classic
cache-invalidation trap, whose failure is silent (confident staleness). OpenProse
makes the key complete *by construction*: the canonicalizer fixes, at compile
time, exactly which fields are material and which facets a node subscribes to. A
render never improvises a new dependency mid-run, so the key cannot drift out of
completeness between compiles; discovering a genuinely new dependency is an
authoring change that re-compiles the contract. There is no roaming judge and no
second "plan-age" clock to police — the completeness guarantee is the
canonicalizer's, frozen ahead of time.

**The missing-webhook problem, and the deterministic continuity clock.**
Memoizing on an input fingerprint means the system could quiesce confidently
while the world changed silently because no event fired. The defense is freshness:
a node declares, in `### Continuity`, that a facet stays valid only until some
`valid_until`. When that instant passes, the harness does not call a model to ask
whether time elapsed — it **mechanically moves that facet's fingerprint** and
wakes the node through the ordinary reconcile path, emitting a zero-token
self-receipt. The lapse *is* a fingerprint move, so "the world will not announce
it changed" becomes an ordinary wake. Forecast's job is exactly this: manufacture
the minimum necessary re-render when no external event will. That is what makes
silence *safe* rather than *negligent*.

### Core invariants

These are the constitution. Each survives the negation test: negate it and the
result is no longer a Reactor-class harness. Items that fail that test (a
negation that still yields a Reactor-class harness, only a worse-designed one)
are design defaults and live in **Architecture**, not here.

1. **Markdown is intent.** The source contract is the durable semantic object.
   Negate it and intent lives in a hidden surface — Tenet 1 broken.
2. **Materiality is compiled and shared.** What counts as a material change —
   the canonicalizer, the topology, and the postcondition validators — is lowered
   once at compile into a static IR, identical on every host. Negate it and two
   hosts disagree about whether the world changed — forked semantics.
3. **Adapters are the only reason hosts differ.** A clone and a long-lived
   deployment diverge only because storage, sandbox, signer, or connector
   adapters differ. Negate it and the loop has forked — Tenet 1 broken.
4. **Activations are bounded.** No continuity depends on one long-running model
   session. Negate it and it is an agent loop, not a Reactor.
5. **Cost scales with surprise.** A normal agent loop's cost scales with
   wall-clock time; a Reactor's with surprise. Stated as a falsifiable challenge:
   **for every token, name the surprise.** Negate it and the differentiator is
   gone. Three backing commitments make this testable:
   - **No fixed-interval work.** The Reactor core spends zero tokens between
     scheduled rechecks. A declared `valid_until` replaces polling — polling is
     "I don't know when"; freshness is "I computed when." Where a source cannot
     push, polling is pushed to a gateway adapter and is itself freshness-paced,
     never a heartbeat.
   - **Memoization is real.** Unchanged input fingerprint → the render body
     provably never runs, recoverable from the `tokens.fresh` vs `tokens.reused`
     split in the receipt.
   - **Every token traces to a named surprise** ∈ {a subscribed input moved, a
     declared freshness window lapsed, the contract itself changed}. A `skipped`
     receipt carries zero cost and copies its fingerprints forward, so the proof
     is a pure predicate over the ledger.
6. **The commit gate is deterministic (`gateCommit`).** A render may commit only
   if its compiled postconditions pass — deterministic validators where the
   obligation can be expressed as one, the render's own self-attestation of its
   `### Maintains` obligations where it is semantic. A render that fails commits
   nothing: the prior truth stands, no downstream wakes, and a `failed` receipt
   records why. There is no judge and no confidence score in the commit decision.
   Negate it and an inadmissible render can corrupt the maintained truth — the
   class's safety claim is void.
7. **Receipts are content-addressed.** Consumers verify evidence instead of
   trusting the producer's claim. The receipt is simultaneously the audit unit, the
   composition unit, and the exit unit. Negate it and Tenets 5 and 6 break at
   once.
8. **State is replayable and exitable.** Given the same contract, event,
   durable state, and adapter outputs, the Reactor decision is reproducible —
   and the contract with its trail can leave for another harness. This is not
   "reproducible for us"; it is "exitable by you" (Tenet 6). Negate it
   and there is no fork-as-exit and no audit.

Demoted to design default (Architecture, not constitution): the published-truth
/ private-workspace split. Only the fingerprinted published artifact is
subscribed and composed; the render's private workspace never leaves the node. It
is a strong default, retained as a hard privacy requirement in **Failure model**,
not as a class-defining invariant.

### Precedence stack

When invariants tension, this ordering decides:

```text
correctness  >  safety  >  cost  >  interrupt-minimization
```

Interrupt-minimization is a downstream ergonomic property, not a pillar. If
minimizing interrupts ever conflicts with failing safe, safety wins — the
system interrupts even though it would rather be silent. "Rare interruption" is
a target, not a constraint other invariants bend around.

### Architecture

Each layer earns its place as the answer to "what does a beat require?"

| Layer | Role | Serves beat |
| --- | --- | --- |
| Responsibility | The standing goal: what must remain true | author |
| Contract Markdown | The durable human- and agent-readable source | author |
| Gateway | Concrete event ingress: schedules, webhooks, queues, files, manual requests; freshness-paced polling only where a source cannot push | walk away |
| Compile (Forme + canonicalizer + postcondition) | Lowers the contract set into deterministic IR — the topology, the per-node canonicalizer, and the postcondition validators — once per contract change | author |
| World-model store | Holds each node's published truth (content-addressed) and its private workspace | exitable trail |
| Reconciler | The dumb run phase: compares fingerprints, skips or renders, gates the commit, propagates | walk away |
| Render | The bounded LLM session that computes a node's next world-model | walk away |
| gateCommit | The deterministic commit gate: postcondition validators + render self-attestation; a failing render commits nothing | verifiable trail |
| Forecast / continuity clock | Manufactures the minimum necessary re-render when the world will not announce change; a lapsed `valid_until` mechanically moves a fingerprint | walk away |
| Cost / token-truth | Local, deterministic, free token receipts; `tokens.fresh` vs `tokens.reused` recoverable | verifiable trail |
| Receipt + ledger | Content-addressed proof carrying the wake, the fingerprints, the disposition, and the cost; an append-only, chain-verifiable trail | verifiable / exitable trail |
| Composition | The dependency graph is the evidence graph | author / verifiable trail |
| Adapters | Filesystem, Postgres, sandbox, connector, signer, event sinks | walk away |

The most important boundary is between semantic intelligence and harness
machinery:

```text
Markdown source defines intent.
Skill and interpreter docs define semantics.
Intelligent sessions compile the contract into IR (topology, canonicalizers, validators).
The harness serves IR and runs the dumb reconciler.
Renders interpret and act inside bounded activations.
The reconciler skips or renders; gateCommit attests; receipts record.
```

**Two adapter seams, never merged.** The bounded-activation **agent SDK**
(`codex-sdk`, `claude-sdk`, …) is an adapter and nothing more: no reconciler
logic ever lives inside it — memoization, the commit gate, and the continuity
clock are the package's, not the activation runtime's. Distinct from it is the
**model-gateway socket** (OpenRouter as the batteries-included default; direct
Anthropic/OpenAI first-class), which serves raw multi-provider inference — the
*inference substrate* that compile sessions and renders draw on. Keeping the two
seams separate is invariant 3 doing load-bearing work: a clone and a long-lived
deployment differ only by which adapters they bind.

**Failure surfaces as a receipt, not a status enum.** There is no
`up`/`drifting`/`down`/`blocked` status and no pressure projection. A render that
errors or cannot satisfy its postconditions writes a `failed` receipt — the prior
truth stands and nothing downstream wakes. The high-value case "this sentence is
not yet decidable — there is nothing observable to maintain against" surfaces the
same way: a `failed` render whose receipt names the gap, routed to the contract
author (Tenet 2). This is the flagship instance of "surface what only a human can
decide," realized as an honest receipt rather than a typed runtime interrupt
class. Richer human-facing interrupts — a typed `needs-input` for a missing
credential, or `contract-declared` paging the author asked for — are a future
affordance layered on the same receipt, not a v1 runtime decision class.

### Failure model

The architecture must be safe when its own intelligence is unreliable. The
defense is structural, not a confidence score:

- **A render that cannot satisfy its postconditions commits nothing.**
  `gateCommit` runs the node's compiled validators deterministically; where an
  obligation is semantic, the render must self-attest it. Either path failing
  yields a `failed` receipt — the prior truth stands, the world-model is
  untouched, and no downstream wakes. An inadmissible render can never corrupt
  the maintained truth or the schedule (Tenet 4; invariant 6).
- **Failure is contained, not propagated.** Because a `failed` render leaves the
  fingerprint unmoved, the dumb reconciler treats it exactly like "nothing
  changed downstream." Retry needs no special machinery: the next wake re-renders
  from the last-good truth. The asymmetry between a wrong commit and a wrong
  inaction is the author's to state per responsibility — some truths fail loud,
  some fail quiet — but the default under doubt is to **not commit**.
- **No judge, no calibration, no ensemble in the loop.** There is no confidence
  signal to calibrate and no ensemble-diversity floor, because the commit
  decision is deterministic. How well an individual model renders is a
  model-choice question measured *offline* (the eval methodology and suite are
  tracked in the Reactor backlog, not in this corpus), never a runtime control
  input.

**Privacy is a failure mode, and the published/workspace split is the
safeguard.** A render works in a **private workspace** that never leaves the
node; only the **published truth** — the fingerprinted, canonicalized artifact —
is subscribed, composed, or exported. Secrets, raw payloads, and scratch
reasoning stay in the workspace by construction, not by ad-hoc response
filtering. A leak from workspace into published truth is a safety failure, not a
cosmetic one — this is the hard requirement referenced from **Core invariants**
where the split was demoted from the constitution.

**Cost is honest observability, not a control input.** Every receipt records
token-truth locally and deterministically (`tokens.fresh` vs `tokens.reused`,
with a `surprise_cause`); dollarization is a projection applied by a pluggable
price oracle, never a receipt field, and "not configured" is a clean null state
(the same honesty bar as the null signer). Cost is read *after the fact* to prove
the cost-scales-with-surprise thesis from the ledger — there is no judge depth to
trade against budget and no meta-loop deciding whether a recompile is "worth it."

> **A path considered and set aside.** An earlier design added a
> *bring-your-own-correctness-truth* oracle — an external anchor that scores the
> system's outputs and feeds a calibration grade back into a variable-depth
> judge. With the judge retired, there is no ensemble to calibrate; an external
> correctness oracle is recorded here as a possible future affordance for
> *offline* evaluation, not a runtime layer.

### Metaphor

Lead with React, and not for palatability — after the unification thesis it is
the _rigorous_ model, with literal mappings:

| React | Reactor |
| --- | --- |
| Component | Responsibility |
| the DOM / UI tree | the world-model |
| the render function | a bounded LLM session that computes the next world-model |
| props | subscriptions (`### Requires` ↔ `### Maintains`) |
| setState | a new signed receipt (the world-model moved) |
| React.memo / dependency array | skip the render when `(contract_fp, input_fps)` is unmoved |
| the commit phase | sign the receipt, persist the world-model, notify subscribers |
| partial reconciliation | quiescence; only the changed subtree re-renders |
| composition / lifting state up | responsibilities consuming each other's receipts |

Kubernetes' controller is a _weaker_ version of the same idea —
reconcile-to-desired-state with no render/commit split, no memoization, no
composition. It is a subset; a one-line footnote acknowledges the lineage.

The metaphor is **explicitly bounded**. React renders are synchronous, cheap,
and the tree does not mutate mid-render; Reactor "renders" are expensive,
asynchronous, and the world mutates underneath them. So React owns the
**structural** dimension; **control-systems** language (forecast, freshness)
owns the **time/cost** dimension. Two metaphors, each owning exactly one
dimension. Three seams are where they meet, stated as resolution rules:

1. **Memoization vs. forecast.** On a quiet input, React says "skip"; control
   systems says "the freshness window expired, re-check." Resolution: when a
   facet's `valid_until` lapses, the continuity clock **moves that facet's
   fingerprint**, so "no external change but freshness expired" becomes an
   ordinary memo-key move. Control systems _feeds_ React; it does not override
   it. This is what makes silence _safe_ rather than _negligent_.
2. **Pure decision vs. side-effecting world.** A render may act on the world,
   but the reconciler's *decision* stays pure: it reads only fingerprints.
   World-mutation is quarantined inside the bounded render, and only the
   canonicalized published truth re-enters the memo key — so the dumb compare
   never depends on a side effect.
3. **Synchronous tree vs. asynchronous world.** A render's output is always
   `as_of` a timestamp, never "now." Every receipt carries `as_of`; that is where
   control-systems time-awareness patches React's frozen-tree assumption.

### Composition

It needs **no new primitive**. "B depends on A" = B's render consumes A's latest
receipt as evidence, identical to a webhook. Three consequences make it native,
not a bolt-on:

- **Propagation reuses memoization exactly.** A's new receipt moves an input
  fingerprint for B → B re-renders; if B's output is unchanged, propagation
  stops. The dependency graph reconciles by the same memoized partial-render
  mechanism as a single responsibility, recursively.
- **Cost amortizes for free.** A is rendered once; N dependents reuse A's
  receipt. Dependency-graph amortization falls out of the architecture.
- **Fork/exit composes.** The edge is "consume receipt at content-address /
  responsibility-ref" — a reference, not a hidden binding. Public
  responsibilities become composable public goods (Tenets 5, 6 land on
  one object).

Three genuine collisions, with their resolutions:

1. **Cycles** (A→B→A). Acyclicity is a deterministic graph property, checked at
   compile: Forme draws the subscription edges and asserts the topology is
   acyclic as a postcondition on its own `### Maintains`. A cycle is a compile
   failure, not a runtime surprise.
2. **Cross-boundary trust.** B must verify A's receipt _and_ its contract
   revision. A public A's owner can silently change semantics, so the dependency
   edge **pins a contract revision and an acceptable signer set**, or composition
   becomes a supply-chain attack — Tenet 5's "verify, don't trust" doing real
   work. In v1 "signed" means meaning-layer chain-consistency; the cryptographic
   byte-hash and a non-null signer are a named, deferred milestone (see *Open
   specification items*), and the pinning surface is specified ahead of it.
3. **Transitive staleness.** A quiesced A may hand B a stale-but-true-looking
   receipt. There is no per-cycle freshness judgment and no policy parameter:
   each facet carries a `valid_until`, and when a consumed facet's window lapses
   the continuity clock **moves its fingerprint**, which wakes B through the
   ordinary reconcile path. For a chain A→B→C this composes by construction —
   each lapse propagates as a fingerprint move, every hop replayable from the
   ledger. Freshness is therefore transitive **and explicit in the world-model**,
   never a discretionary judgment (invariant 8, Tenet 6).

### Open specification items

Deferred by design — named here so they are tracked, not invented or silently
dropped:

1. **Receipt schema — the as-built `v0` shape.** Every decision writes a
   content-addressed receipt: the `node`, its `contract_fingerprint`, the `wake`
   (`source ∈ {input, self, external}` plus the upstream `refs` that caused it),
   the `input_fingerprints` it depended on, the per-facet `fingerprints` it
   produced, a `status ∈ {rendered, skipped, failed}`, the `prev` link that makes
   the per-node chain verifiable, and a `cost` block (`provider`, `model`,
   `tokens.fresh` vs `tokens.reused`, `surprise_cause`) that makes the
   cost-scales-with-surprise and memoization proofs recoverable from a single
   receipt. A `sig` block where `scheme: "none"` carries a `null_reason` is a
   first-class, non-deceptive state. There is **no** `verdict`, no confidence or
   calibration grade, no `role` enum, and no `judge`/`policy-compile` cause —
   those were retired with the judge. The ledger is an append-only, flat
   `<state-dir>/receipts.json`.
2. **The cryptographic signer.** v1 "signed" means tamper-evident at the meaning
   layer and chain-consistent — *not* yet a cryptographic byte hash. The null
   signer is the only honest v1 state; a real signing adapter (and the byte hash
   that makes cross-boundary trust non-repudiable) is a named, deferred
   milestone. The composition pinning surface (contract revision + acceptable
   signer set) is specified ahead of it.
3. **Ledger compaction.** The receipt ledger grows without bound; an external
   compaction/indexing plan for long-running responsibilities is named roadmap,
   not shipped.
4. **Facet inference.** Authors declare facets explicitly today (`####` parts
   under `### Maintains`). Inferring a good facet split from a contract —
   proposing the material/immaterial boundary — is a v-next compile-phase
   enhancement, not v1.
5. **The fixpoint.** The topology-as-responsibility recursion (*The unification
   thesis*) — the system maintaining its own wiring as just another memoized
   render, with epoch rollover when the contract set changes — is specified and
   deferred past v1.
6. **Default freshness derivation.** A `serve` default that reconstructs each
   node's freshness schedule from a `valid_until` convention in published truth —
   so the common case self-paces with zero per-project wiring — is specified; v1
   ships a fixed `--poll-interval` cadence and the default projector is deferred.

### Where it excels

The reusable judgment is in the properties, not a list of domains. Reactor-class
harnesses are strongest when:

- the goal is a **state to maintain**, not a one-shot deliverable;
- events arrive over time from multiple sources;
- the world state is partly ambiguous and requires interpretation;
- the system must avoid duplicate or thrashing actions;
- the value of acting depends on freshness, risk, or cost;
- the user needs an audit trail for why an action happened;
- the implementation may change while the declared intent stays stable;
- multiple models may perform differently across rendering and compilation.

Weak fits: one-off report writing; pure batch transforms; low-stakes throwaway
prompts; deterministic jobs that need no judgment; workflows where every step
is already known and stable; tasks where public receipts or durable state add
more friction than value. OpenProse can still run one-shot services; they are
just not the canonical case.

Two costs are structurally irreducible and must be stated honestly. **A
no-cheap-hash domain boundary:** where deciding "did the semantically relevant
content change" essentially _is_ the work (research novelty, regulatory drift,
competitive framing), no cheap-and-complete identity exists; the system stays
correct and safe (the continuity clock still manufactures the recheck) but loses
the cost differentiator and degrades gracefully to forecast-cadence cost. Reactor
excels where a cheap stable identity exists; semantic-only-drift domains are a
documented boundary, not a hidden failure. **A compile-phase floor:**
intelligence is not free — when an author changes a contract, the compile phase
spends tokens to re-derive the canonicalizer, the topology, and the validators.
But compile is the rarest event in the system (it fires only on a source change,
never on a world change), so that floor is amortized across the whole life of a
stable contract.

One worked example, kept here because it demonstrates the thesis better than
any other — the world mutates with every message, so cost must scale with
surprise, not time:

#### Incident Briefing Room

```text
Goal: The incident channel has an accurate current briefing.
Requires: incident messages, status-page state.
Maintains: a briefing whose impact, timeline, owner, next action, and
           customer-facing status are current (postcondition: every field is
           either filled or explicitly marked pending owner input).
Continuity: wake on each incident message and status-page change; while the
            incident is active, valid_until is +15 minutes.
```

The modeled world changes with every message. The desired output is not "answer
once"; it is "keep the briefing true" while spending tokens only on what
actually changed. Additional worked examples are catalogued in Part II.

---

## II. What Exists Today

This section is the conformance ledger: what `@openprose/reactor` (the SDK,
v0.2.0) and `@openprose/reactor-cli` (the `reactor` binary, v0.1.0) physically
ship today, measured against Part I and honest about what is partial or not yet
wired. The companion keyless replay viewer `@openprose/reactor-devtools`
(v0.1.0) ships alongside.

**The retired judge/policy spine is gone, not current.** The earlier
`@openprose/responsibility` package — with its judge, verdict/status enum,
pressure projection, variable-depth ensemble, two-timescale policy-compile loop,
and deterministic kernel with rollback — is **not** what ships. `@openprose/reactor`
is a greenfield gut-and-rebuild against the Part I model: a per-node
**canonicalizer** + **Forme topology** + **postcondition validators** authored
once at compile, over a **dumb deterministic reconciler** that compares
`(contract_fingerprint, input_fingerprints)` and decides skip / render /
gateCommit / propagate. No judge re-decides at wake time. Receipt status is
`{rendered, skipped, failed}`. Where the prior package left a mark it is only as
operational scars learned the expensive way (durable cursor idempotency, restart
recovery) — never as a policy core being extended.

### Shipped Open Source Surface

| Surface           | What Exists                                                                                                                                                                          |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SDK core          | `@openprose/reactor` v0.2.0 — the headless, zero-runtime-dependency reconciler, world-model store, canonicalizer, postcondition `gateCommit`, receipt ledger, forecast/freshness bridge |
| CLI               | `@openprose/reactor-cli` v0.1.0 — the `reactor` binary: `init`, `doctor`, `compile`, `run`, `serve`, `trigger`, `status`, `topology`, `inspect`, `logs`, `trace`, `receipts`            |
| Replay viewer     | `@openprose/reactor-devtools` v0.1.0 — keyless offline receipt-ledger replay (`--describe` headless summary + browser graph)                                                            |
| Contract kinds    | `responsibility`, `function`, `gateway`, `pattern`, `test` (authored in `*.prose.md`); compiled by intelligent sessions, never a `.prose` parser                                        |
| State layout      | a `<state-dir>` (default `./.reactor`): flat `receipts.json`, `world-models/<node>/published.json`, and a content-addressed `compile/` IR cache                                         |
| Render seam       | the bounded-activation agent SDK adapter (host-supplied `@openai/agents`) over a model gateway (OpenRouter default); the live render needs a key, every observability command is keyless         |

The open source surface already shows a Reactor-class harness end to end:
authored responsibilities, an intelligent compile that freezes the canonicalizer
+ topology + validators into a cached IR, a dumb reconciler that drains to
quiescence, a durable serve daemon, and a content-addressed receipt trail you can
replay offline.

### Responsibility Catalog

These worked examples were moved out of Part I (one example is enough to teach
the thesis) but remain a useful catalog. The two scaffolded contracts ship today
as runnable CLI examples (`examples/quickstart`, `examples/gateway-connector`);
the rest are authoring targets phrased in the current section vocabulary
(`### Goal` / `### Requires` / `### Maintains` / `### Continuity`).

- **Release readiness** — `### Goal:` the release candidate is ready to ship;
  `### Continuity` wakes before every planned release and when release evidence
  changes; `### Maintains` postconditions are tests pass, rollback exists,
  blockers resolved, notes current.
- **Customer risk radar** — `### Goal:` renewal risks for named customers are
  surfaced before account reviews; wakes weekly and on support/CRM/product
  signal change; the value is a maintained risk view, not a one-shot
  classification.
- **Compliance evidence tracker** — `### Goal:` required control evidence is
  current enough for the next audit; benefits directly from receipts and tiered
  projection (rich owner evidence, sanitized public proof).
- **Research inbox triage** — `### Goal:` new research leads are classified and
  routed each workday; makes model differences visible (some render better, some
  are cheaper for routine work).

### The SDK: `@openprose/reactor`

`@openprose/reactor` v0.2.0 is the **headless, zero-runtime-dependency SDK core**
— the reconciler, the receipt ledger, the world-model store, and the
compile/render seams. It installs no provider, no key, and no UI; the live render
needs two host-supplied deps (`@openai/agents`, `zod`), while the
inspection/replay surface needs neither. It exposes deterministic, content-addressed building blocks
through typed subpaths (verified against `package.json` exports):

| Subpath                          | Ships                                                                                                                     |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `@openprose/reactor/reactor` *   | the **dumb reconciler** — memo/skip → schedule (single-flight + dirty-coalescing) → commit → propagate; no judge step      |
| `@openprose/reactor/canonicalizer` | the per-node compiled fingerprint function over `### Maintains`; re-lowered keylessly from a serializable spec at mount    |
| `@openprose/reactor/forme`       | the topology render — `### Requires` ↔ `### Maintains` wiring with diagnostics and an acyclicity postcondition             |
| `@openprose/reactor/postcondition` * | `compilePostconditions(...)` + `gateCommit(...)` — deterministic validators + the render's `### Maintains` self-attestation |
| `@openprose/reactor/receipt`     | receipt v0 build/verify/inspect; status `{rendered, skipped, failed}`; `verifyReceipt` + `verifyReceiptChain` check a receipt and the ledger chain |
| `@openprose/reactor/world-model` | the content-addressed store with the published-truth / private-workspace split (`fs-store`, `store`, `canonical`)          |
| `@openprose/reactor/memo`        | the `(contract_fingerprint, input_fingerprints)` memo key — and nothing else                                              |
| `@openprose/reactor/forecast`    | self-driven `### Continuity`: a lapsed `valid_until` mechanically moves a facet fingerprint and wakes the node (zero-token) |
| `@openprose/reactor/composition` | the read-isolation pin — a content-addressed snapshot of each consumed upstream facet (the dependency = evidence graph)    |
| `@openprose/reactor/cost`        | token-truth: `tokens.fresh` vs `tokens.reused` + `surprise_cause`                                                          |
| `@openprose/reactor/projection`  | tiered receipt-proof projection (owner / subscriber / public) that keeps private payload fields out of lower-trust views   |
| `@openprose/reactor/sdk`         | `createReactor` + `run-project` — mount a DAG, drive wakes, read dispositions                                              |
| `@openprose/reactor/adapters/*`  | the two seams: `agent-compile` (compile sessions → IR), `agent-render` (bounded render); plus fs/memory storage, connectors |

\* The `reactor` and `postcondition` modules are internal-by-subpath today
(barrels under `src/`, not in the published `exports` map); the table names them
to locate the shipped behavior. The `exports` map itself publishes **fifteen**
subpaths: the non-starred rows above (with `adapters/*` covering both
`agent-compile` and `agent-render`), plus the root `.`, `./run-project`, and
`./evidence-plan` (not separately tabled). `reactor` and `postcondition` are
**not** among them.

The reconciler's surprise property is an enforced, tested invariant: when an
input fingerprint does not move, the render body provably never runs, recoverable
from the `tokens.fresh` vs `tokens.reused` split in the receipt. The commit gate
is offline — no model call is on the commit path.

**gateCommit run-phase wiring is partial — state it plainly.** The deterministic
commit gate `gateCommit(...)` and `compilePostconditions(...)` are built and
unit-tested, and the `agent-compile` adapter emits each node's validator set into
the compiled IR. But the live `agent-render` adapter today gates a commit on the
render's **own structured done/failed self-attestation** of its `### Maintains`
obligations — it returns `rendered` or `failed`, and the reconciler trusts that
outcome — rather than re-running the compiled `gateCommit(...)` validators over
the render's output in the run phase. The two halves exist; threading the
compiled deterministic validators into the render adapter's commit path is the
named remaining wiring (see Part III). A failed render still commits nothing: the
prior world-model stands and nothing downstream wakes.

### The CLI: `@openprose/reactor-cli`

`@openprose/reactor-cli` v0.1.0 ships the `reactor` binary as the deterministic
**reference client** that configures the SDK — it never re-implements the
reconciler and never parses `.prose`. The three-phase lifecycle is
`compile → run → serve`:

- **`compile`** runs the intelligent compile *sessions* (Forme topology, per-node
  canonicalizer, postconditions) and freezes them into a content-addressed IR
  cache under `<state-dir>/compile/`. The cache key is `(contract-set fingerprint,
  SDK version, model id)` — **cost is never part of cache identity** — so an
  unchanged contract set re-compiles at zero session cost (a cache hit), and a
  fresh process re-lowers each node's canonicalizer keylessly from the serialized
  spec. `compile --check` exits non-zero on a stale cache (CI-wireable).
- **`run`** ensures the IR is fresh, boots the reactor, drains to quiescence,
  prints per-node dispositions + cost, and exits (one-shot).
- **`serve`** boots the durable host (flat `receipts.json` + filesystem
  world-models), runs the continuity driver loop, and exposes a small HTTP
  surface (`GET /health`, `GET /status`, `GET /cost`, `POST /<node>/trigger`).
  It binds `127.0.0.1` by default and ships **no auth in v1** (the trigger route
  can cause model spend; front it with a proxy before exposing). It drains
  in-flight work on `SIGINT`/`SIGTERM`.

The full command surface (verified against the README + `src/commands/`):
`init`, `doctor` (`--live` runs one smoke render), `compile`, `run`, `serve`,
`trigger`, `status`, `topology`, `inspect`, `logs`, `trace`, and
`receipts [list|verify|cost]`. Documented stable exit codes: `0` success, `1` a
reported failure with an actionable message (stale cache, broken chain, no
contracts, bad config, unhealthy env, missing live key/dep), `2` a usage error.

**The offline boundary is real and load-bearing.** Requiring the CLI entrypoint
loads neither `@openai/agents` nor `zod`; only `compile`/`run`/`serve`/`trigger`
reach the model surface, via dynamic `import()` inside the handler. `init`,
`doctor`, and the **whole observability suite** (`status`, `topology`, `inspect`,
`logs`, `trace`, `receipts`) run fully offline with the model deps absent — and
so does the keyless `reactor-devtools` replay. The per-package
`pnpm test:offline` (no key, no network) is the contributor commit gate.

**Durable substrate.** `serve` persists to a flat `<state-dir>/receipts.json`
(the chain-verifiable ledger, the same file `reactor-devtools <state-dir>` reads)
plus `world-models/<node>/published.json`. Connector idempotency is durable: a
per-source cursor dedups arrivals so a restart never re-ingests the backlog.
Built-in connectors are `static`, `http`, `file`, plus a `connectors.{cjs,js}`
plugin seam. A `reactors:` list hosts N isolated reactors; `--concurrency N`
bounds *across-reactor* parallelism (within a reactor, drains stay strictly
serial behind a per-reactor queue — node-level parallelism is the deferred
Change B).

### Storage and parity

The default storage is filesystem (`adapters/storage-fs`), with an in-memory
adapter for tests. There is **no Postgres adapter** in this SDK surface today —
the storage seam is synchronous, and a Postgres/durable cloud adapter is honestly
out of scope until the seam goes async. Parity is therefore replay parity: a fresh
reactor can import a runtime-produced receipt log and produce the same next
receipt hash, and the `receipts verify` chain check is the portable proof a clone
reconstructs the same trail.

### Conformance Ledger

Part I states the invariants as an unqualified north star. This ledger is where
reality is honest, keyed to the eight Part I invariants. The verdict is reported
against the shipped `@openprose/reactor` v0.2.0 / `@openprose/reactor-cli` v0.1.0
build, not the retired judge package.

| Invariant                              | State   | Evidence / Gap                                                                                                                                                                                                                                |
| -------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Markdown is intent                  | Conformant | `*.prose.md` is the sole semantic source; the compile sessions author the canonicalizer/topology/validators, and the run phase reads only fingerprints — no second authored runtime surface.                                                       |
| 2. Materiality is compiled and shared  | Conformant (single-model) | The canonicalizer, the Forme topology, and the postcondition validators are lowered once at compile into a content-addressed IR keyed `(contract-set fp, SDK version, model id)`; a fresh process re-lowers each canonicalizer keylessly from the serialized spec — byte-identical across hosts on the same key. Cross-*model* materiality parity is unverified. |
| 3. Adapters are the only reason hosts differ | Conformant (surface), unmeasured (live) | The SDK seam injects all adapters with no hidden defaults; the live render seam is the agent SDK over a model gateway. Recorded provider parity is not yet a shipped multi-provider matrix.                                                          |
| 4. Activations are bounded             | Conformant | Continuity lives in the durable receipt trail + world-model store; no long-running session. Renders are bounded, single-flight-per-node, dirty-coalescing.                                                                                          |
| 5. Cost scales with surprise           | Conformant as a tested invariant; unmeasured empirically | The memo-skip is an enforced test invariant — an unmoved input fingerprint provably never runs the render body, recoverable from `tokens.fresh` vs `tokens.reused` + `surprise_cause`. **No benchmark/dollar numbers** are claimed; honest long-horizon benchmarks are the named open ask (README "Deliberately not yet here"). |
| 6. The commit gate is deterministic (`gateCommit`) | **Partial** | `gateCommit(...)` + `compilePostconditions(...)` are built and unit-tested; `agent-compile` emits each node's validator set into the IR. The live `agent-render` adapter commits on the render's **own done/failed self-attestation** of `### Maintains`, not yet on a run-phase `gateCommit(...)` call over the render output. A failed render still commits nothing. Wiring the compiled validators into the render commit path is the named remaining work. |
| 7. Receipts are content-addressed      | Conformant; meaning-layer signer only | Receipt v0 is content-addressed and chain-verifiable (`verifyReceiptChain`, `receipts verify`), persisted to flat `<state-dir>/receipts.json`. Tiered `projection` keeps private payload fields out of subscriber/public proofs. The signer is an explicit **null state** (`{ scheme: "none", null_reason: "no-signer-adapter-configured" }`) — v1 "signed" = chain-consistency, not a cryptographic byte hash. |
| 8. State is replayable and exitable    | Conformant (chain), partial (artifacts) | A fresh reactor imports a runtime-produced ledger and produces the same next receipt hash; `reactor-devtools <state-dir>` replays it offline. Caveat: `receipts verify` proves chain consistency, **not** the world-model artifacts on disk — editing a `world-models/*/published.json` while leaving `receipts.json` intact is not caught (the null-signer boundary). |

The same honesty discipline applies to the null signer, the partial gateCommit
wiring, and the pre-publish package state (see Honest Current Limits).

### Tests And Release Gate

The shipped suites (verified against the package `scripts` and `src/` layout):

- SDK runtime + type tests across every module — reconciler, canonicalizer,
  postcondition/`gateCommit`, receipt build/verify, world-model store, memo,
  forecast/freshness, composition pins, cost, projection, the agent-compile and
  agent-render adapters, and the cycle/acyclicity check.
- CLI tests across `init`, `doctor`, `compile` (incl. cache hit/`--check`),
  `run`, `serve` (HTTP surface + drain), `trigger`, and the whole observability
  suite — including the test asserting the **flat `<state-dir>/receipts.json`**
  at the state-dir root for DevTools interop.
- The devtools replay suite (keyless).
- The **offline commit gate** — `pnpm -C packages/<pkg> test:offline`, run with
  no model key and no network. The published GitHub Actions release gate uses npm
  trusted publishing/OIDC and rejects tag/package-version mismatches.

What they prove: the SDK builds, packs, imports, and reconciles deterministically;
the memo-skip invariant holds; receipts are content-addressed and chain-verify;
the CLI configures the SDK and drives a real receipt through `compile → run/serve`;
the observability suite runs fully offline; tiered projection keeps secrets out of
lower-trust views.

What they do **not** prove: a measured cost-vs-baseline speedup; long-horizon
convergence; cross-model materiality or render-quality parity; production ingress
hardening. These are the deliberately-pending items the README and Part III name.

### Shipped Inventory

| Area              | Location                                                              | Role                                                                                       |
| ----------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| SDK package       | `packages/reactor/` (`@openprose/reactor` v0.2.0)                     | The headless reconciler + canonicalizer + postcondition + receipt + world-model + forecast + composition SDK |
| Reconciler        | `packages/reactor/src/reactor/index.ts`                              | The dumb run phase: memo/skip → schedule → commit → propagate; no judge                     |
| Canonicalizer     | `packages/reactor/src/canonicalizer/`                               | Per-node compiled fingerprint function over `### Maintains`; facet boundaries               |
| Postcondition     | `packages/reactor/src/postcondition/index.ts`                       | `compilePostconditions(...)` + `gateCommit(...)` (built/tested; run-phase wiring partial)   |
| Receipt ledger    | `packages/reactor/src/receipt/index.ts`                             | Receipt v0 build/verify/inspect; status `{rendered, skipped, failed}`; null signature       |
| World-model store | `packages/reactor/src/world-model/`                                 | Content-addressed store; published-truth / private-workspace split; `fs-store`              |
| Forecast          | `packages/reactor/src/forecast/index.ts`                            | Self-driven `### Continuity`; `valid_until` → fingerprint freshness bridge (zero-token)      |
| Composition       | `packages/reactor/src/composition/index.ts`                         | The read-isolation pin over each consumed upstream facet                                     |
| Render seam       | `packages/reactor/src/adapters/agent-render/`                       | The bounded LLM render; commits on self-attested done/failed                                 |
| Compile seam      | `packages/reactor/src/adapters/agent-compile/`                      | Compile sessions → topology / canonicalizer / postcondition IR                              |
| CLI package       | `packages/reactor-cli/` (`@openprose/reactor-cli` v0.1.0)           | The `reactor` binary; `src/commands/` holds the 12 commands + serve HTTP surface             |
| Replay viewer     | `packages/reactor-devtools/` (`@openprose/reactor-devtools` v0.1.0) | Keyless offline receipt-ledger replay (`--describe` + browser graph)                         |
| Examples          | `packages/reactor-cli/examples/`                                    | `quickstart` (gateway + responsibility) and `gateway-connector`, runnable from a fresh checkout |

This is enough to say the Reactor-class harness exists as shipped software. It is
not yet enough to say the public category claim is empirically proven.

### Honest Current Limits

- The three packages are staged as pre-publish tarballs; they must hit public npm
  before a clean `npm i -g` story (the CLI/devtools peer-depend on the SDK).
- **`gateCommit`'s compiled validators are not yet wired into the live render
  commit path** — the run phase trusts the render's `### Maintains`
  self-attestation (invariant 6 is Partial).
- The signer is null-only (meaning-layer chain consistency); no cryptographic
  byte hash, so `receipts verify` does not bind the world-model artifacts on disk.
- No benchmark or dollar numbers — the surprise property is a tested invariant,
  not a measured speedup; honest long-horizon benchmarks are the named open ask.
- No Postgres / durable cloud storage adapter (the storage seam is synchronous).
- Within-reactor node-level parallelism (Change B) is deferred; `--concurrency`
  parallelizes reactors, not nodes.
- `serve` uses a fixed `--poll-interval` cadence; the default `valid_until`
  freshness projector (and adaptive idle-to-soonest-recheck) is deferred.
- The fixpoint (topology-as-responsibility), facet inference, and ledger
  compaction are specified and deferred.
- `serve` ships no auth in v1 — the HTTP surface is a single-operator,
  trusted-network interface until fronted by a proxy.
- The technical report and the cross-model matrix have not been produced.

> The implementation is strong enough to justify the category thesis. The
> category should launch only after the evaluation and evidence suite makes the
> claim difficult to dismiss.

---

## III. What Is Next

Turn the Reactor-class harness from a plausible architecture into a published
technical claim.

### Launch Standard

Do not publicly launch "Reactor-class harness" until three artifacts ship
together:

1. A release-quality open source CLI using `@openprose/reactor`.
2. A technical report defining the class, architecture, baselines, and results.
3. A reproducible eval suite that lets others inspect the claim.

The bar:

```text
Can we credibly say this architecture is novel, simple, high quality, based on
proven systems patterns, and empirically useful for event-based high-complexity
rerenders of modeled world state — and that its cost scales with surprise, not
time?
```

### Required Engineering Work

#### 1. Publish And Pin The Packages

The three packages are staged tarballs (`@openprose/reactor` 0.2.0,
`@openprose/reactor-cli` 0.1.0, `@openprose/reactor-devtools` 0.1.0). Ship them to
public npm with provenance via the existing OIDC/trusted-publishing GitHub Actions
gate (it already rejects tag/package-version mismatches), so the CLI and devtools
can peer-depend on the published SDK cleanly. This is the minimum that turns
"install all three tarballs, SDK first" into `npm i -g @openprose/reactor-cli`.

#### 2. Wire `gateCommit` Into The Run-Phase Commit

The deterministic commit gate is the half-built invariant. `gateCommit(...)` and
`compilePostconditions(...)` exist and are tested, and `agent-compile` already
emits each node's validator set into the IR — but the live `agent-render` adapter
commits on the render's own `### Maintains` self-attestation, not on a run-phase
`gateCommit(...)` call over the render's output. Thread the compiled validators
into the render adapter's commit path so a commit must pass deterministic
postconditions **and** the render's self-attestation, closing invariant 6. A
failure on either path still commits nothing and writes a `failed` receipt.

#### 3. The Cryptographic Signer

Today's signer is the honest null state (`scheme: "none"`); `receipts verify`
proves chain consistency but not the world-model artifacts on disk. Add a real
signing adapter that produces a cryptographic byte hash binding the published
world-model to its receipt, so `verify` catches an edited
`world-models/*/published.json`, and so cross-boundary composition (the
contract-revision + acceptable-signer pin) becomes non-repudiable. The pinning
surface (the read-isolation pin in `composition`) is already specified ahead of it.

#### 4. The Default Freshness Projector + Adaptive Serve Cadence

`serve` runs a fixed `--poll-interval` cadence because `readFreshness` arms no
instants today. Build the default `valid_until` freshness projector that
reconstructs each node's recheck schedule from a `valid_until` convention in
published truth, then let `serve` sleep to the soonest armed `next_self_recheck`
instead of a flat heartbeat — so the common case self-paces with zero per-project
wiring and a quiet system trends to genuinely zero tokens.

#### 5. Ledger Compaction And Facet Inference

The flat `receipts.json` grows without bound; a compaction/indexing plan for
long-running responsibilities is named, not shipped. And authors declare facets
explicitly (`####` parts under `### Maintains`) — inferring a good
material/immaterial facet split from a contract is a v-next compile-phase
enhancement.

#### 6. The Fixpoint (Topology-As-Responsibility)

The closing recursion: mount Forme + the compile sessions as ordinary reactor
nodes so the reactor maintains its **own** topology, memoized on the contract-set
fingerprint, with an epoch rollover when the contract set changes (and a
cold-miss sweep). The CLI surface stays the same — `compile` shifts from an
external batch to forcing/inspecting the compile nodes, `serve` stops
special-casing re-compile, and `status`/`topology` gain an epoch view. Specified
and deferred past v1.

#### 7. Within-Reactor Parallelism (Change B)

`--concurrency` parallelizes reactors, not nodes; the SDK has no `maxConcurrency`
and within a reactor drains stay serial behind a per-reactor queue. Adding a
node-level render worker pool (the pool pulling individual ready node-renders,
preserving single-flight-per-node) is the deferred Change B.

### Required Evaluation Suite

A research instrument, not only a test suite. The shipped offline suites (SDK +
CLI + devtools, with the memo-skip and chain-verify invariants) stay; the work is
to add the **empirical** layer the README openly marks pending.

#### Reactor Evals To Add

| Eval                          | Question                                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------ |
| **Cost scales with surprise** | Across a long event stream, is every fresh token attributable to a `surprise_cause`; does standing spend stay flat under no change? |
| Reconciliation correctness    | Given an event and the prior world-model, does the reconciler reach the oracle disposition (skip / render / propagate)? |
| Continuity freshness          | Does a lapsed `valid_until` manufacture exactly the minimum recheck — no missed staleness, no heartbeat spend? |
| Duplicate event idempotency   | Do repeated arrivals (same `id_field`) produce one render via the durable cursor?                      |
| Crash recovery                | Does a restart rebuild from the ledger + world-model store and produce the same next receipt?           |
| gateCommit safety             | Does a render that fails its compiled postconditions commit nothing and leave the fingerprint unmoved?  |
| Privacy projection            | Do secrets / PII in the private workspace stay out of subscriber/public receipt projections?            |
| Contract-set fencing          | Does a contract change re-fingerprint and re-compile, invalidating stale IR?                            |
| Composition propagation       | Does a dependent re-render only when an upstream facet fingerprint moves; does cost amortize across N dependents? |
| Supply-chain pinning          | Does a dependent reject an upstream world-model whose pinned content-address / signer does not match?   |
| Long-horizon maintenance      | Does state hold over simulated 7 / 30 / 90 day timelines without drift or unbounded spend?              |
| Undecidable contract          | Does an un-maintainable contract surface a `failed` receipt naming the gap, routed to the author?       |

Each eval emits machine-readable results and a human-readable report. (`EVALS.md`
in the SDK is the on-ramp for authoring a scenario against the public exports.)

#### Baselines

- naive single-agent loop (cost scales with time)
- cron-only re-render loop (fixed cadence, no memoization)
- workflow DAG with retries but no reconciler
- model-interpreted Reactor doctrine without the compiled canonicalizer
- **Reactor without memoization** (every wake renders — the control that isolates
  the surprise property)
- **Reactor without the continuity clock** (no freshness — silent staleness)
- **Reactor without composition** (islands — no receipt-as-evidence reuse)

The best result is precise, not triumphal:

```text
Memoization makes cost scale with surprise, not the clock.
The continuity clock makes silence safe rather than negligent.
Receipts make every render auditable without changing task quality.
Composition amortizes cost across dependents.
Model choice changes render quality more than reconciler correctness.
```

### Model Matrix

Target families: Anthropic, OpenAI, Gemini, Grok. Test premium and cheaper
models. The point is model fit by role, not leaderboard quality. With the judge
retired, there are exactly two model roles — **compile** (authoring the
canonicalizer / topology / validators) and **render** (computing a node's next
world-model).

| Role     | What To Measure                                                                            |
| -------- | ------------------------------------------------------------------------------------------ |
| Compile  | canonicalizer completeness (does the memo key capture every material input?), facet-boundary quality, validator soundness, topology acyclicity |
| Render   | restoration rate, overreach rate, output quality, cost, postcondition self-attestation honesty |
| End-to-end | convergence rate, renders to restoration, cost per maintained responsibility, fraction of tokens attributable to a `surprise_cause` |

Cross-model **materiality parity** is the sharpest open question: does a
canonicalizer authored by model A produce the same skip/render decisions as one
authored by model B on the same contract? That is invariant 2's live, unmeasured
edge. The matrix runs through both seams — the bounded-activation agent-session
adapter and the model gateway — so the adapter boundary stays honest permanently.

### Public Case Studies

1. release readiness
2. incident briefing room
3. customer risk radar
4. compliance evidence tracker
5. vendor renewal watch
6. research inbox triage
7. content performance loop

Each includes: source responsibility and gateway contracts; a synthetic or
sanitized event stream; the expected oracle disposition trajectory (skip / render
/ propagate per wake); the compiled IR (topology + canonicalizer + validators);
the receipt ledger; final projections; a cost-and-latency summary with
`surprise_cause` attribution; and a baseline comparison. Runnable from the CLI and
replayable keylessly with `reactor-devtools`.

### Technical Report Outline

Written after the evals, not before.

1. **Problem**: AI agents are bad at long-lived responsibility maintenance.
2. **Category**: Definition of Reactor-class harnesses.
3. **Prior Patterns**: React reconciliation (lead), control systems (time/cost
   dimension), with event sourcing, dataflow, controllers, workflow engines,
   CQRS / read models, and actor systems as footnoted lineage.
4. **OpenProse Design**: the lived loop; the unification thesis; the
   intelligent-compile / dumb-run split; the canonicalizer + Forme topology +
   postcondition validators; forecast-gated quiescence; composition via receipts;
   tiered projections; the two adapter seams.
5. **Implementation**: `@openprose/reactor` (the reconciler, world-model store,
   receipt ledger), `@openprose/reactor-cli`, `@openprose/reactor-devtools`,
   filesystem storage, the null-vs-cryptographic signer.
6. **Evaluation Methodology**: scenarios, domains, baselines, metrics, the
   compile/render model matrix.
7. **Results**: cost-scales-with-surprise, materiality parity across models,
   ablations, convergence, latency, idempotency, crash recovery, privacy.
8. **Case Studies**: selected responsibilities and timelines.
9. **Limitations**: connector coverage, render reliability, prompt sensitivity,
   the null-signer boundary, the no-cheap-hash semantic-drift domain, open items
   I.1–I.6 from Part I.
10. **Future Work**: the fixpoint (topology-as-responsibility), facet inference,
    learned freshness projection, deeper dependency-graph amortization. (A public
    responsibility market is out of scope of this specification.)

Sober. Make a strong claim, then show the evidence and the limits.

### Definition Of Done For Launch

- `@openprose/reactor`, `@openprose/reactor-cli`, and
  `@openprose/reactor-devtools` are public, version-consistent, and provenance-
  verified through the OIDC gate.
- `gateCommit`'s compiled validators are wired into the run-phase commit (invariant
  6 closed), not only the render's self-attestation.
- A fresh clone runs the `quickstart` and `gateway-connector` examples end to end;
  the keyless `reactor-devtools` replay shows dispositions + cost-by-surprise.
- The eval suite includes the offline invariant tests **plus** the empirical
  Reactor evals (cost-scales-with-surprise, continuity freshness, composition),
  the baselines, and compile/render model-matrix results.
- The technical report includes measured results, not only architectural prose.
- Receipts and projections are honest about the null-signer default vs. an
  optional cryptographic signer adapter; export/replay works from the ledger.
- Public examples avoid leaking private or sensitive evidence.
- The docs define when to use a Reactor-class harness and when not to.
- Open items I.1–I.6 are either closed or explicitly scoped as future work.
- A technically skeptical reader can reproduce enough of the claim to trust it.

The release sentence:

> OpenProse is a Reactor-class harness for maintaining AI-authored
> responsibilities over time: an intelligent compile freezes what counts as a
> change into a per-node canonicalizer, and a dumb reconciler re-renders only what
> materially moved against a content-addressed, chain-verifiable receipt trail —
> so its cost scales with surprise, not time.

That is a category worth naming.
