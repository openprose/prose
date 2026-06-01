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
2. What exists today, assuming the responsibility CLI harness branch is merged
   and released.
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
2. **Don't check now.** A self-driven node's truth carries a `valid_until`;
   until it lapses, the node sleeps. Provable quiescence is genuinely zero tokens
   on a static world. (= don't re-render until a dependency changes or freshness
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
  model-choice question measured *offline* (see [04-Evals.md](./04-Evals.md)),
  never a runtime control input.

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
- the value of acting depends on freshness, confidence, risk, or cost;
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

This section assumes the responsibility CLI harness branch is merged to main
and released: `@openprose/responsibility` is used by the open source
CLI/server, with the skill-level Reactor doctrine repurposed around that
package.

**Read this part as prior art mined, not a foundation being extended.** The
Reactor package is greenfield — `@openprose/reactor` is built fresh against
the Part I spec. What carries forward from the older
`@openprose/responsibility` is not its policy core but hard-won operational
scars — crash-window replay, durable pressure-dispatch claims, restart
recovery — requirements discovered the expensive way. Everything below
describes what physically exists today and remains factually accurate; its
role, however, is the quarry, not the scaffold. The Conformance Ledger tracks
`@openprose/reactor`'s climb toward Part I, not the retrofit of the prior
package. **`@openprose/responsibility` is not on the shipping path and is
scheduled for deletion; it is retained only as referenceable prior art whose
architecture diverges from the plan. All release, pin, and parity gates target
`@openprose/reactor`.** Where passages below still name
`@openprose/responsibility`, read it as the soon-to-be-deleted prior package
being mined, never as the artifact that ships.

### Existing Open Source Surface

| Surface             | What Exists                                                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contract Markdown   | `*.prose.md` source files with `service`, `system`, `gateway`, `test`, `pattern`, and `responsibility` kinds                                      |
| Responsibility docs | `skills/open-prose/responsibility-runtime.md`, `concepts/responsibility.md`, and `concepts/reactor.md`                                            |
| CLI                 | `prose compile`, `prose serve`, `prose run`, and `prose status`                                                                                   |
| Examples            | release readiness, incident briefing, customer risk, compliance evidence, research inbox, content performance, vendor renewal, stargazer outreach |
| State layout        | `runs/`, `state/`, `state/responsibilities/`, and package-owned responsibility runtime state                                                      |
| Agent hosts         | Codex, Claude, and mock harness support                                                                                                           |

The open source repository can already show the _shape_ of a Reactor-class
harness: authored responsibilities, compiled intent, local serve, bounded
activations, status files, pressure, and status inspection.

### Responsibility Catalog

These worked examples were moved out of Part I (one example is enough to teach
the thesis) but remain a useful catalog. The corresponding contracts ship as
runnable examples (see Release-Candidate Inventory).

- **Release readiness** — `Goal:` the release candidate is ready to ship;
  check before every planned release and when release evidence changes;
  criteria are tests pass, rollback exists, blockers resolved, notes current.
- **Customer risk radar** — `Goal:` renewal risks for named customers are
  surfaced before account reviews; check weekly and on support/CRM/product
  signal change; the value is a maintained risk view, not one classification.
- **Compliance evidence tracker** — `Goal:` required control evidence is
  current enough for the next audit; benefits directly from receipts and tiered
  projection (rich owner evidence, sanitized public proof).
- **Research inbox triage** — `Goal:` new research leads are classified and
  routed each workday; makes model differences visible (some classify better,
  some are cheaper for routine fulfillment).

### Shared Responsibility Package

`@openprose/responsibility` is the shared TypeScript package for responsibility
judging, forecasting, Reactor decisions, runtime loops, traces, receipts, and
storage adapters. In the release-candidate state it is no longer merely a
backend dependency: the CLI imports it and uses it as the typed Reactor
authority. Under the greenfield decision this package is **prior art**:
`@openprose/reactor` reimplements the Part I spec from scratch and salvages at
most interface shapes and the operational scars named above — never the policy
core.

The package contains:

- pure Reactor decision logic
- forecast logic
- contract and protocol types
- runtime loop machinery
- filesystem and Postgres adapter surfaces
- judge protocol interfaces
- investigation, trace, summary, and receipt shapes
- storage fencing and replay-oriented records

It is the compiled runtime policy the CLI/server runs.

### CLI Reactor Bridge

The CLI release-candidate branch adds a package-backed Reactor bridge that does
three jobs:

1. converts local OpenProse responsibility status records into package runtime
   inputs;
2. calls the shared Reactor/runtime package to produce decisions, schedules,
   forecasts, and next actions;
3. mirrors compact local projections for `prose status` and ordinary
   fulfillment activations.

Local `prose serve` is no longer an agent-interpreted version of the Reactor
concept; it uses the same package policy as the backend. The bridge includes:

- package-backed decision recording after judge status
- package-owned runtime state under the OpenProse root
- compact local projections under `state/responsibilities/{id}/`
- status, pressure, and Reactor decision history
- scheduled judge and fulfillment handling
- durable pressure dispatch claims
- restart recovery for scheduled work
- restart recovery for due but undispatched pressure
- crash-window replay when status exists without a matching Reactor decision
- deterministic decision replay from supplied timestamps
- validation of Reactor decision records
- line-numbered errors for invalid local Reactor history

This is the first credible form of a single shared policy across hosts.

### Skill-Level Reactor Doctrine

The skill docs are no longer the runtime implementation by proxy; they are the
doctrine and authoring frame around the package.

| Layer                       | Role                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------ |
| SKILL docs                  | Explain how agents should understand responsibilities, Reactor, pressure, and bounded runs |
| Contract Markdown           | Gives authors the durable source language                                                  |
| Compiler docs               | Define how source lowers into repository IR                                                |
| CLI harness                 | Serves compiled IR and calls the shared package                                            |
| `@openprose/responsibility` | Owns typed Reactor decisions, forecasts, runtime state, and receipts                       |

### Package Consumers

`@openprose/reactor` has one consumer: the CLI/server. The 2026-05-13 judge
architecture buildout moved the core Reactor, forecast, runtime loop, storage
adapter, judge protocol, and receipt concepts into the shared package so the
CLI is glue rather than policy.

- The shared package owns runtime decisions.
- Postgres is an optional durable storage *adapter* alongside the filesystem
  default — not a cloud surface; it stores durable cycles, runs, decisions,
  forecasts, receipts, and projections.

Parity is therefore not CLI-vs-backend but cross-adapter and cross-replay: the
same package over the same fixtures produces byte-identical policy outputs
across storage adapters and across runs.

### Conformance Ledger

Part I states the invariants as an unqualified north star. This ledger is where
reality is honest. Near-term breakage is acceptable when it is recorded with a
plan; strictness lives in the ideal, the ledger tracks the climb. Every "plan"
column below is `@openprose/reactor`'s greenfield climb; `@openprose/responsibility`
appears only as the prior art whose scars informed the plan, never as a base
being patched.

**2026-05-18 — `@openprose/reactor` v0.1 spine, W1–W6 accepted.** The
greenfield package's permanent spine (receipt v0 + token-truth substrate,
deterministic kernel incl. fixed backstops with fail-closed seed semantics,
rollback-to-last-known-good, cycle detection, the B1/B2/B3 no-anchor additions
with a model-authored `backstop_divergence_predicate` the kernel only
evaluates, a bounded-`indeterminate`→`needs-judgment` primitive, the compiled
evidence plan, the memoization primitive, forecast-gated scheduling, and the
adapter-injected SDK seam) is implemented and passed an overseer breadth-first
acceptance review with 37 deterministic tests green via the documented
command. This is unit/contract-verified substrate, **not** an empirical proof
of the cost thesis — that remains the v0.1 acceptance gate (the Cradle
static-world flat-token scenario). Build-out: `planning/plans/2026-05-18-reactor-harness-ideal-architecture/`.

**2026-05-19 — Phase A runtime acceptance landed.** The build now has a
runtime-produced W7 static-world Cradle path: `runScenarioV0` drives a public
`createReactor` handle, the passing path reads `reactor.receipts()`, and the
old hand-built W7 receipt table is out of the acceptance path. Observed token
shape: bootstrap real input `fresh=41`; evidence-age rechecks `fresh=0` with
reused tokens; plan-age audit floor `fresh=5`. The same wave added one-shot
cold-start policy authorship through the agent-SDK adapter and export/import
registry hydration with a byte-identical next-decision round trip.

**2026-05-20 — B5 live K1 cassette landed.** One OpenRouter K1 ensemble
recording now exists at
`packages/reactor-cradle/src/spikes/fixtures/k1-live-recorded.json`. It spans
`google/gemini-3.1-flash-lite-preview` (small),
`mistralai/mistral-small-3.2-24b-instruct` (small), and
`qwen/qwen-2.5-72b-instruct` (large), with provider and family diversity;
records request ids, response ids, latency, finish reason, usage,
provider/model names, and spend metadata; and passes the same K1 evaluator as
the recorded diverse fixture. Actual spend: `0.00022823 USD` under the
`2.00 USD` cap. Cassette file SHA-256:
`f64484990635a61a3dcac973a96e97d6433a576ccc297c23742d4a515e2c1868`. This is
live calibration evidence, not runtime variable-depth ensemble judging.

**2026-05-20 — Wave 1 CLI scars and projections landed.** CLI commit
`153bab8` landed the release-readiness real source-to-IR compile path, real
fulfillment artifact path, crash-window replay, and owner/subscriber/public
status tiers. Gate hardening commit `979bacd` closed the sharper
duplicate-trigger observable: two identical `POST /release/readiness` triggers
in one serve cycle now produce exactly one Reactor receipt, one durable
pressure record, one pressure claim, and one fulfillment dispatch. Reviewer
repair commit `ddfd023` tightened the operational scars: crash replay now kills
after a pressure dispatch claim is on disk but before fulfillment completes,
and duplicate-trigger dedupe now survives distinct HTTP receive timestamps via
a normalized `triggerDedupeKey`. Follow-up commit `8e68133` makes
`pressure.latest.json` replay-safe under full-suite load by using an atomic
latest write and a parseable-pressure test wait. The focused E6 suite is
8 files / 10 tests green; full CLI suite is 25 files / 263 tests green. This
closes the local operational-scar and privacy-projection
substrate for Phase E; it does not claim production ingress/fulfillment/oracle
or public stranger-run evidence.

| Invariant                                     | State      | Gap / Plan                                                                                                                                                                                                                              |
| --------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Markdown is intent                         | Conformant | `*.prose.md` is the sole semantic source; the kernel reads source meaning only via the pinned `contract_revision` content hash — no second authored surface                                                                              |
| 2. Policy is model-authored, compiled, shared | Partial    | Deterministic kernel executes model-authored policy artifacts; runtime cold start now invokes `authorPolicyArtifactV0` once through the agent-SDK adapter and persists revision `1`. The model-authored, recompiled-on-drift two-timescale loop is v0.2 |
| 3. Adapters are the only reason hosts differ  | Recorded provider parity | SDK seam injects all adapters with no hidden defaults (verified); Phase C recorded two named provider/model paths producing byte-identical policy artifact bytes with fail-closed provider drift. This is recorded provider parity, not live provider support or model quality parity |
| 4. Activations are bounded                    | Conformant | Continuity lives in durable state; no long-running session                                                                                                                                                                              |
| 5. Cost scales with surprise                  | Measured v0.1 with controls | Phase C's report table measures the same scenarios through runtime-produced Reactor receipts and deterministic controls. Static Reactor/no-memo/naive-loop is `46:46` / `92:0` / `256:0`; event-changing Reactor/no-memo/naive-loop is `74:74` / `148:0` / `148:0`. The no-memo and naive-loop rows are controls, not shipped runtime modes |
| 6. The judge fails safe                       | Partial + one live K1 cassette | Kernel fail-safe substantially built & verified: fail-closed seed semantics, degraded-calibration ladder, bounded-`indeterminate`->`needs-judgment`, every fail/blocked outcome a content-addressed receipt. B5 adds one live-recorded OpenRouter K1 cassette accepted by the evaluator (`google/gemini-3.1-flash-lite-preview`, `mistralai/mistral-small-3.2-24b-instruct`, `qwen/qwen-2.5-72b-instruct`; SHA-256 `f64484990635a61a3dcac973a96e97d6433a576ccc297c23742d4a515e2c1868`); runtime variable-depth ensemble judging remains post-launch |
| 7. Receipts are content-addressed             | Partial + CLI projection tiers | Receipt v0 content-addressing real & verified (canonicalization, `evidence_input_ids` content-addressed, `as_of`/`next_forecast_recheck`, fresh-vs-reused). E15 wires `prose status --tier=owner|subscriber|public`; the secret-injection test proves owner projection can see owner-only receipt data while subscriber/public output does not leak secret-shaped tags or rationale. Signing path is null-only; cross-adapter parity not yet a gate |
| 8. State is replayable and exitable           | Partial + local operational scars | Runtime receipt logs export/import with registry hydration, and a fresh reactor can import a runtime-produced log then produce the same next receipt hash as the original. E13/E14 add local CLI scars: restart after a post-claim/pre-fulfillment crash converges from durable, atomically written pressure within one cycle, and duplicate identical triggers short-circuit to exactly one fulfillment dispatch. Phase C records memory/filesystem storage parity and an honest Postgres defer until the storage seam becomes async |

The same honesty discipline already applies to null-signer and the unpublished
package (see Honest Current Limits).

### Existing Tests And Release Checks

- responsibility package unit, runtime, adapter, judge, and type tests
- CLI unit and integration tests
- repository IR tests
- responsibility status and pressure tests
- package-backed CLI Reactor bridge tests
- serve daemon scheduling and restart recovery tests
- CLI crash-window replay and duplicate-trigger idempotency tests
- owner/subscriber/public projection secret-injection tests
- package dry-run checks
- CLI release preflight checks
- responsibility package pin verification
- lock-step intent around exact package content hashes

What they prove: the package can be built, packed, imported, tested; the CLI
uses the package instead of a separate local policy; local state records are
validated and replayable; scheduling, pressure dispatch, and restart recovery
work for important local cases; release packaging can be checked before publish.

What they do not yet prove: Reactor-class is the best architecture for target
domains; the harness outperforms simpler baselines; forecasts improve cost,
freshness, or reliability; hysteresis reduces oscillation under noisy judgment;
model families behave differently inside the harness; public projections and
receipts are robust enough for a technical report; real-world case studies
converge over long horizons; **cost scales with surprise** under measurement.

### Release-Candidate Inventory

| Area               | Location                                                                                                | Current Role                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Shared package     | `platform/packages/responsibility/`                                                                     | Core types, Reactor, forecast, runtime loop, storage adapters, judges, traces, summaries, receipts                            |
| Reactor policy     | `platform/packages/responsibility/src/core/reactor.ts`                                                  | Typed decision policy: scheduling judges, fulfillment, retry, escalation, human review, quiescence                            |
| Forecast policy    | `platform/packages/responsibility/src/core/forecast.ts`                                                 | Drift and truth-probability forecasting used to pull future checks earlier                                                    |
| Runtime loop       | `platform/packages/responsibility/src/runtime/loop.ts`                                                  | Shared runtime loop used by cloud and local adapter compositions                                                              |
| Filesystem adapter | `platform/packages/responsibility/src/adapters/storage-fs.ts`                                           | Local durable package state for the CLI harness                                                                               |
| Postgres adapter   | `platform/packages/responsibility/src/adapters/storage-pg.ts`                                           | Cloud durable package state for the API backend                                                                               |
| CLI bridge         | `platform/external/prose/tools/cli/src/prose/responsibility-reactor.ts`                                 | Converts local judge status into package runtime inputs; mirrors decisions into local projections                             |
| CLI serve loop     | `platform/external/prose/tools/cli/src/prose/repository-serve.ts`                                       | Launches bounded judge and fulfillment activations, records package-backed Reactor decisions                                  |
| CLI daemon         | `platform/external/prose/tools/cli/src/prose/repository-serve-daemon.ts`                                | Schedules judge and fulfillment actions, restores pending work, replays crash-window status                                   |
| Local pressure     | `platform/external/prose/tools/cli/src/prose/responsibility-pressure.ts`                                | Durable pressure projection and dispatch claim support                                                                        |
| Local status       | `platform/external/prose/tools/cli/src/prose/responsibility-status.ts`                                  | Judge status records, confidence, coverage, timestamp validation                                                              |
| Local status view  | `platform/external/prose/tools/cli/src/prose/repository-status.ts`                                      | `prose status` projection over IR, status, pressure, Reactor decisions                                                        |
| Skill doctrine     | `platform/external/prose/skills/open-prose/responsibility-runtime.md`                                   | Agent-facing Responsibility Runtime with package-backed Reactor semantics                                                     |
| Reactor concept    | `platform/external/prose/skills/open-prose/concepts/reactor.md`                                         | Conceptual definition of evented reconciliation, status, pressure, cadence, fulfillment                                       |
| Contract docs      | `platform/external/prose/skills/open-prose/contract-markdown.md`                                        | Markdown source contract surface for responsibilities and gateways                                                            |
| CLI package        | `platform/external/prose/tools/cli/package.json`                                                        | Public CLI package depending on `@openprose/responsibility`                                                                   |
| Backend pin        | `platform/apps/api/.openprose-pin.json`                                                                 | Content hash tying the backend to the expected responsibility package artifact                                                |
| CLI tests          | `platform/external/prose/tools/cli/tests/prose/`                                                        | Repository IR, serve, status, pressure, Reactor bridge coverage                                                               |
| Package tests      | `platform/packages/responsibility/src/**/__tests__/` and `platform/packages/responsibility/test-types/` | Core/runtime/adapter/judge/type coverage                                                                                      |
| Examples           | `platform/external/prose/skills/open-prose/examples/`                                                   | Runnable responsibility examples for release readiness, incidents, customer risk, compliance, inbox triage, and related loops |

This is enough to say the Reactor-class harness exists as software. It is not
yet enough to say the public category claim is proven.

The boundary with the language is explicit and stated from both sides:
repository IR v0 is frozen and source-derived, while the policy artifact,
token-truth receipts, forecasts, and decisions are sibling runtime state owned
by `@openprose/reactor` — not IR fields and not `*.prose.md` syntax (see
[01-Language.md](./01-Language.md) Part II "Repository IR v0" and Part III §3).

### Honest Current Limits

- `@openprose/reactor` must be published publicly before the CLI release
  can depend on it cleanly.
- Cross-adapter/replay parity should become a required CI gate, not only a local proof.
- The model matrix has not been run across Anthropic, OpenAI, Gemini, and Grok.
- Baselines and ablations have not been collected.
- Long-horizon responsibility simulations are not yet a standard suite.
- Public receipts and projection guarantees need launch-grade evidence.
- The two-timescale policy loop, variable-depth judging, token-truth receipts,
  and composition-via-receipts are designed (Part I) but not yet implemented.
- The technical report has not been written from measured results.
- "Reactor-class harness" is not yet pinned to a formal public spec and
  evaluation methodology.

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

#### 1. Publish And Pin The Shared Package

Public npm release; provenance; packed `dist`; exact version pin from the CLI;
CI verification that the installed package matches the expected hash; release
workflow that fails if local source and published package diverge. This is the
minimum proof the published package and local source match.

#### 2. Make Cross-Adapter / Replay Parity A Gate

The same package over the same fixtures produces byte-identical policy outputs
across storage adapters (filesystem vs. optional Postgres) and across replays,
where adapters are not supposed to differ. Required parity fixtures:

- healthy responsibility stays quiet
- drifting responsibility schedules fulfillment
- down responsibility escalates after budget exhaustion
- blocked responsibility requests human review or escalation
- forecast pulls judge earlier
- hysteresis prevents flip-flop
- duplicate webhook does not duplicate pressure
- stale status is rejected or fenced
- contract revision change fences old decisions
- **policy recompile produces a byte-identical registry from identical history**
- **memoized verdict reuse spends zero judge tokens**

Required CI, not a best-effort script.

#### 3. Complete The Local Harness As A Public Product Surface

- clear `prose serve` startup logs for active responsibilities and triggers
- `prose status` view of latest status, Reactor decision, forecast, pending
  pressure, scheduled judge, **and per-token surprise attribution**
- deterministic local state layout docs
- example repositories runnable from a fresh clone
- local failure messages explaining missing tools, missing IDs, invalid status,
  stale claims, malformed decisions, **and undecidable contracts**
- a first-class **export/exit** surface (the contract and its trail leave
  cleanly — invariant 8, Tenet 6)
- release preflight that checks examples, package imports, and docs

The public developer should run one example and immediately understand why this
is not just cron plus prompt — ideally by watching token spend stay flat while
nothing changes.

#### 4. Harden Receipts And Projections

- content-addressed judge and decision receipts
- local receipt inspection
- a receipt proof surface for inspection and verification
- owner/subscriber/public projection contracts
- privacy tests that inject secrets and PII into judge rationale and prove they
  do not leak to public views (tiered projection is enforced here)
- event payloads that use real receipt hashes, not signature placeholders
- null-signer is the default and explicit; cryptographic signing is an
  optional pluggable signer adapter for cross-trust-domain non-repudiation
- receipts carry `as_of` and `next_forecast_recheck`; dependency edges pin
  contract revision and acceptable signer set (composition supply-chain safety)
- token-truth fields finalized after provider research (open item I.1)

### Required Evaluation Suite

A research instrument, not only a test suite.

#### Existing Evals To Keep

package unit; runtime loop; storage adapter; judge protocol; CLI repository IR;
CLI serve and status; status and pressure; package bridge; release preflight;
package pin verification; negative architecture tests.

#### Novel Reactor Evals To Add

| Eval                             | Question                                                                                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Reconciliation correctness       | Does the Reactor choose the oracle next action from event, status, history, budget?                                                                    |
| Forecast quality                 | Does forecast scheduling catch likely drift earlier without excessive checks?                                                                          |
| Oscillation resistance           | Does hysteresis avoid flip-flopping under noisy judge outputs?                                                                                         |
| Duplicate event idempotency      | Do repeated webhooks/queue/timer ticks produce one action?                                                                                             |
| Crash recovery                   | Does restart converge after status, decision, or pressure-dispatch interruption?                                                                       |
| Capability blocking              | Does missing tool/connector state become `blocked`, not hallucinated success?                                                                          |
| Privacy projection               | Do secrets, emails, private URLs, customer payloads stay out of public views?                                                                          |
| Contract revision fencing        | Do old decisions stop applying after source changes?                                                                                                   |
| Long-horizon maintenance         | Does state hold over simulated 7, 30, 90 day timelines?                                                                                                |
| Adversarial evidence             | Does conflicting/malicious evidence reduce confidence or escalate?                                                                                     |
| **Cost scales with surprise**    | Can every token be attributed to a surprise-cause; does spend stay flat under no change?                                                               |
| **Variable-depth correctness**   | Does the judge escalate depth only when uncertain/high-stakes, and downgrade when confident?                                                           |
| **Policy recompile correctness** | Does the model-authored policy recompile on policy drift, and does the meta-loop stay stable (no recompile thrash, rollback to last-known-good works)? |
| **Composition propagation**      | Does a dependent re-judge only when an upstream receipt changes; does cost amortize across N dependents?                                               |
| **Supply-chain pinning**         | Does a dependent reject an upstream receipt whose contract revision or signer is not pinned?                                                           |
| **Calibration anchor**           | Does scoring the ensemble against bring-your-own-correctness-truth measurably reduce ensemble bias?                                                    |
| **Undecidable contract**         | Does the judge emit an undecidable diagnosis on an unjudgeable contract, routed to the author?                                                         |
| Human-review boundary            | Does the runtime ask for review when autonomy would be unsafe?                                                                                         |

Each eval emits machine-readable results and a human-readable report.

#### Baselines

- naive single-agent loop
- cron-only judge and fulfillment loop
- workflow DAG with retries but no Reactor
- model-interpreted Reactor doctrine without package policy
- Reactor without forecast
- Reactor without hysteresis
- Reactor without receipts
- Reactor without durable pressure claims
- **Reactor without memoization (cost scales with time)**
- **Reactor without variable-depth judging (fixed ensemble)**
- **Reactor without policy recompile (fixed policy)**
- **Reactor without composition (islands)**

The best result is precise, not triumphal:

```text
Forecast improves freshness in event-sparse domains.
Memoization makes cost scale with surprise, not time.
Variable-depth judging preserves accuracy at lower cost.
Hysteresis reduces unnecessary fulfillment under noisy judgment.
Durable decisions and claims improve crash recovery and idempotency.
Receipts improve auditability without changing task quality.
Composition amortizes cost across dependents.
Model choice changes judge accuracy more than Reactor correctness.
```

### Model Matrix

Target families: Anthropic, OpenAI, Gemini, Grok. Test premium and cheaper
models. The point is model fit by role, not leaderboard quality.

| Role        | What To Measure                                                             |
| ----------- | --------------------------------------------------------------------------- |
| Judge       | status accuracy, evidence quality, calibration, blocked correctness         |
| Fulfillment | restoration rate, overreach rate, output quality, cost                      |
| Summarizer  | projection safety, concision, evidence preservation                         |
| End-to-end  | convergence rate, cycles to restoration, cost per maintained responsibility |

Metrics: status accuracy and F1; Brier/calibration error for confidence; action
optimality vs oracle Reactor decisions; convergence rate; duplicate action
rate; escalation correctness; privacy leak rate; cost per maintained
responsibility; **fraction of tokens attributable to a surprise-cause**;
latency to restoration; receipt completeness; human review pass rate.

Questions: which models are best judges; best fulfillers; which cheaper models
safely replace expensive ones after confidence is high; where the Reactor
compensates for weaker models; where model quality still dominates; **where
ensemble disagreement is a well-calibrated uncertainty signal**.

The matrix runs through **both** seams — the bounded-activation agent-session
adapter and the model-gateway socket — so the adapter boundary stays honest
permanently and the policy-author migration path is exercised, not assumed.

### Public Case Studies

1. release readiness
2. incident briefing room
3. customer risk radar
4. compliance evidence tracker
5. vendor renewal watch
6. research inbox triage
7. content performance loop

Each includes: source responsibility and gateway contracts; synthetic or
sanitized event stream; expected oracle status trajectory; model outputs;
Reactor decisions; forecasts; pressure records; receipts; final projections;
cost and latency summary (including surprise attribution); baseline comparison.
Runnable from the CLI.

### Technical Report Outline

Written after the evals, not before.

1. **Problem**: AI agents are bad at long-lived responsibility maintenance.
2. **Category**: Definition of Reactor-class harnesses.
3. **Prior Patterns**: React reconciliation (lead), control systems (time/cost
   dimension), with event sourcing, dataflow, controllers, workflow engines,
   CQRS / read models, and actor systems as footnoted lineage.
4. **OpenProse Design**: lived loop; the unification thesis; two-timescale
   policy; variable-depth judging; forecast-gated quiescence; composition;
   receipts; projections; adapters.
5. **Implementation**: `@openprose/reactor`, CLI/server, storage,
   optional signing, cross-adapter/replay parity.
6. **Evaluation Methodology**: fixtures, domains, baselines, metrics, model
   matrix.
7. **Results**: cost-scales-with-surprise, model differences, ablations,
   convergence, latency, idempotency, crash recovery, privacy.
8. **Case Studies**: selected responsibilities and timelines.
9. **Limitations**: connector coverage, judge reliability, prompt sensitivity,
   public receipt maturity, cost curves, human review, open items I.1–I.6.
10. **Future Work**: learned forecast policies, automatic model routing,
    deeper dependency-graph amortization. (A public responsibility market is
    out of scope of this specification.)

Sober. Make a strong claim, then show the evidence and the limits.

### Definition Of Done For Launch

- `@openprose/reactor` is public, pinned, and verified.
- The CLI release imports the package and passes release preflight from a clean
  install.
- Backend and CLI parity fixtures are required CI, including policy-recompile
  and memoization parity.
- At least five public examples run locally from a fresh clone.
- The eval suite includes conventional tests, Reactor evals (including
  cost-scales-with-surprise, variable depth, policy recompile, composition),
  baselines, and model matrix results.
- The technical report includes measured results, not only architectural prose.
- Receipts and projections are honest about the null-signer default vs. an
  optional signer adapter; export/exit works.
- Public examples avoid leaking private or sensitive evidence.
- The docs define when to use a Reactor-class harness and when not to.
- Open items I.1–I.6 are either closed or explicitly scoped as future work.
- A technically skeptical reader can reproduce enough of the claim to trust it.

The release sentence:

> OpenProse is a Reactor-class harness for maintaining AI-authored
> responsibilities over time: it reconciles declarative goals against events,
> durable observations, forecasts, typed decisions, and auditable receipts —
> and its cost scales with surprise, not time.

That is a category worth naming.
