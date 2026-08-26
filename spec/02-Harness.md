# OpenProse Harness

###### The contract a conforming harness satisfies: evented reconciliation of AI-maintained world state.

The OpenProse corpus divides labor exactly, and each document maps to what
ships:

- [01-Language.md](./01-Language.md) — **the Language & Framework**, bundled as
  the **SKILL**: syntax, kinds, sections, compile model, std/co.
- [02-Harness.md](./02-Harness.md) — **this document, the Harness
  contract**: what any conforming harness (a CLI, a server, a hosted runtime)
  must do to *serve* these contracts — the loop, invariants, the reconciler,
  memoization, forecast, receipts, composition. It names the architectural
  class underneath continuous outcomes and answers _what the runtime must do_.
- [03-AuthoringPattern.md](./03-AuthoringPattern.md) — **the Authoring
  Pattern**, **SKILL-bundled but harness-governed**: how to write `*.prose.md`
  so a conforming harness's mechanisms engage. It bridges the Language doc and
  this doc.
- [00-Tenets.md](./00-Tenets.md) — **the constitution**. When any
  document tensions with a tenet, the tenet wins.

`ContinuousOutcomes.md` is out-of-scope ideation, not part of the runtime spec.

This document specifies the ideal harness; it does not track what any one
implementation has shipped. A harness measures itself against this contract in
its own repository (see *Shipped harnesses* at the end), and nothing in the
language depends on which harness is serving.

---

## The Ideal Harness

### What it is like to use one

Start from the lived loop, not the machinery. The architecture is the
consequence of this promise, not the thing itself.

> You write one sentence of durable intent and what makes it true. Then you
> walk away — there is no session to babysit. The system needs you back on
> exactly two conditions: it needs a judgment only a human can make, or an
> input or permission only you can grant. On either it stops and files a
> `failed` receipt — addressed to you, naming exactly what it needs — for you to
> pull; otherwise it is silent. Everything it
> did, you can verify afterward from a trail you never had to ask for — and you
> can take that trail and that sentence and run them somewhere else.

Four beats: **author**, **walk away**, **back only when genuinely needed**,
**verifiable and exitable trail**.

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
  -> the reconciler compares (contract_fingerprint, input_fingerprints, freshness_epoch)
  -> unmoved: write a cheap `skipped` receipt, render nothing
  -> moved (an input changed, the contract changed, or a freshness window lapsed):
       spawn one bounded render session -> gateCommit -> sign a receipt
  -> propagate: a moved fingerprint wakes the downstream subscribers
```

The harness is *conforming* when that reconcile decision is **deterministic,
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

A conforming harness asks:

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

> **A render is a single step `(contract, evidence, prior world-model) → (new
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
authors, deterministic code validates, the reconciler runs.

Compile re-fires only when the **contract-set fingerprint** moves — an author
changed intent. A quiet contract set compiles zero times for as long as it stays
quiet; the IR is byte-identical across that whole window. There is no second,
receipt-history-driven compile: nothing re-optimizes a control policy at runtime,
because there is no control policy to optimize (see *A path considered and set
aside*, above). The only thing that re-fingerprints between source edits is the
world the contracts observe — and that drives **renders**, never recompiles.

### Quiescence

The headline behavior, and the clearest proof of the thesis:

> A normal agent loop's cost scales with wall-clock time. A conforming
> harness's cost scales with **surprise**: for every token, you can name the change that
> justified it.

Quiescence is not the absence of behavior; it is three explicit behaviors,
ordered by how much they save:

1. **Don't act.** Nothing the node subscribes to moved, so it writes a cheap
   `skipped` receipt and renders nothing. The trivial case.
2. **Don't check now.** Each self-driven facet carries a `valid_until`;
   until the soonest one lapses, the node sleeps. Provable quiescence is genuinely
   zero tokens on a static world. (= don't re-render until a dependency changes or freshness
   lapses.)
3. **Don't re-render the whole graph.** When a fingerprint does move, only the
   subtree that subscribes to it wakes; the rest stays asleep. (= reconcile the
   changed region, not the tree.)

The rigorous core is **memoization**: a render is keyed by
`(contract_fingerprint, input_fingerprints, freshness_epoch)` — the node's own
contract, the fingerprints of every facet it subscribes to, and the freshness
epoch that advances when a declared `valid_until` lapses (see *The missing-webhook
problem*). A node that declares no facets exposes one always-on whole-truth
token, and a consumer whose `### Requires` names that producer *without* a facet
binds to that token — waking on the OR of every facet. Unchanged key → the
render is skipped at zero token cost, `React.memo`
semantics applied to a bounded LLM session. The key contains **nothing judged**:
no judge verdict, no policy artifact, no confidence score — its three parts are
the contract, the subscribed inputs, and time, nothing more. What "counts as a
change" was decided once, at compile, by the canonicalizer; the run phase only
compares. (A harness may realize the freshness term as a forecast-driven
self-receipt over a two-part `(contract_fp, input_fps)` key rather than a literal
third element; the decision semantics are identical.)

**Completeness is a compile-time property, not a runtime audit.** A memo key is
only safe if it captures every input that could change the truth — the classic
cache-invalidation trap, whose failure is silent (confident staleness). OpenProse
makes the key complete *relative to the declared material set*: the canonicalizer
fixes, at compile time, exactly which fields are material and which facets a node
subscribes to. A render never improvises a new dependency mid-run, so the key
cannot drift out of completeness *between compiles* — an under-declared dependency
stays silently stale until an author notices and re-compiles, but the key never
degrades on its own. Discovering a genuinely new dependency is an authoring change
that re-compiles the contract. There is no roaming judge and no
second "plan-age" clock to police — the completeness guarantee is the
canonicalizer's, frozen ahead of time.

**The missing-webhook problem, and the deterministic continuity clock.**
Memoizing on an input fingerprint means the system could quiesce confidently
while the world changed silently because no event fired. The defense is freshness:
a node declares, in `### Continuity`, that a facet stays valid only until some
`valid_until`. When that instant passes, the harness does not call a model to ask
whether time elapsed — it **mechanically advances the node's freshness epoch**
(and, for a *consumed* upstream facet whose window lapsed, moves that facet's
input fingerprint) and wakes the node through the ordinary reconcile path,
emitting a zero-token self-receipt. The lapse *is* a memo-key move, so "the world
will not announce it changed" becomes an ordinary wake. Forecast's job is exactly this: manufacture
the minimum necessary re-render when no external event will. That is what makes
silence *safe* rather than *negligent*.

### Core invariants

These are the constitution. Each survives the negation test: negate it and the
result is no longer a conforming harness. Items that fail that test (a
negation that still yields a conforming harness, only a worse-designed one)
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
   session. Negate it and it is an agent loop, not a conforming harness.
5. **Cost scales with surprise.** A normal agent loop's cost scales with
   wall-clock time; a conforming harness's with surprise. Stated as a falsifiable challenge:
   **for every token, name the surprise.** Negate it and the differentiator is
   gone. Three backing commitments make this testable:
   - **No fixed-interval work.** The reconciler spends zero tokens between
     scheduled rechecks. A declared `valid_until` replaces polling — polling is
     "I don't know when"; freshness is "I computed when." Where a source cannot
     push, polling is pushed to a gateway adapter and is itself freshness-paced,
     never a heartbeat.
   - **Memoization is real.** Unchanged memo key → the render body provably
     never runs, recoverable from the `tokens.fresh` vs `tokens.reused` split in
     the receipt.
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
   The hard guarantee — an inadmissible render cannot corrupt the truth — is the
   **deterministic** validators'; where an obligation is only semantic, the
   render's self-attestation is a *soft* gate (the render attesting its own
   `### Maintains` obligations), and how honestly a
   model attests is a model-choice property measured offline, not a runtime
   guarantee. Negate the deterministic gate and an inadmissible render can corrupt
   the maintained truth — the class's correctness guarantee is void.
7. **Receipts are content-addressed.** Consumers verify evidence instead of
   trusting the producer's claim. The receipt is simultaneously the audit unit, the
   composition unit, and the exit unit. Negate it and Tenets 5 and 6 break at
   once.
8. **State is replayable and exitable.** Given the same contract, event,
   durable state, and adapter outputs, the reconcile decision is reproducible —
   and the contract with its trail can leave for another harness. This is not
   "reproducible for us"; it is "exitable by you" (Tenet 6). Negate it
   and there is no fork-as-exit and no audit.

Demoted to design default (Architecture, not constitution): the published-truth
/ private-workspace split. Only the fingerprinted published artifact is
subscribed and composed; the render's private workspace never leaves the node. It
is a strong default, retained as a hard privacy requirement in **Failure model**,
not as a class-defining invariant.

### Precedence stack

Correctness is the non-negotiable floor (Tenets 1, 2, and 5, realized at compile
and the commit gate). Below it, when invariants tension over the
safety → cost → silence trade-offs, this ordering decides:

```text
correctness  >  safety  >  cost  >  interrupt-minimization
```

It is the operational projection of the numbered tenet precedence
([00-Tenets.md](./00-Tenets.md)), not a separate runtime policy dial that
resolves every invariant collision on its own.
Interrupt-minimization is a downstream ergonomic property, not a pillar. If
minimizing interrupts ever conflicts with failing safe, safety wins — the
system surfaces the need even though it would rather be silent. "Rare interruption" is
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

**Two adapter seams, never merged.** The bounded-activation **agent SDK** (the
host-supplied agent runner, e.g. `@openai/agents`) is an adapter and nothing more:
no reconciler logic ever lives inside it — memoization, the commit gate, and the
continuity clock are the harness's, not the activation runtime's. Distinct from it is the
**model-gateway socket** (OpenRouter as the batteries-included default; direct
Anthropic/OpenAI first-class), which serves raw multi-provider inference — the
*inference substrate* that compile sessions and renders draw on. Keeping the two
seams separate is invariant 3 doing load-bearing work: a clone and a long-lived
deployment differ only by which adapters they bind. These two seams are how a host
realizes the abstract `spawn_session` / inference primitives the Language doc's
*Prose Complete* table names ([01-Language.md](./01-Language.md)).

**Failure surfaces as a receipt, not a status enum.** There is no
`up`/`drifting`/`down`/`blocked` status and no pressure projection. A render that
errors or cannot satisfy its postconditions writes a `failed` receipt — the prior
truth stands and nothing downstream wakes. The high-value case "this sentence is
not yet decidable — there is nothing observable to maintain against" surfaces the
same way: a `failed` render whose receipt names the gap, routed to the contract
author (Tenet 2). This is the flagship instance of "surface what only a human can
decide," realized as an honest receipt rather than a typed runtime interrupt
class. Even the human-facing signal stays a *pull*: a `needs-input` for a missing
credential or a `contract-declared` flag the author asked for is a **reason on
the same receipt**, surfaced in the trail for the author to pull — never a fourth
runtime decision class, and never a push the harness owns. Active out-of-band
delivery (paging, email) is a notification layer someone may build *over* the
trail, outside this promise.

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
  the harness's to publish, not this corpus's), never a runtime control
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

| React | OpenProse |
| --- | --- |
| Component | Responsibility |
| the DOM / UI tree | the world-model |
| the render function | a bounded LLM session that computes the next world-model |
| props | subscriptions (`### Requires` ↔ `### Maintains`) |
| setState | a new signed receipt (the world-model moved) |
| React.memo / dependency array | skip the render when `(contract_fp, input_fps, freshness_epoch)` is unmoved |
| the commit phase | sign the receipt, persist the world-model, notify subscribers |
| partial reconciliation | quiescence; only the changed subtree re-renders |
| composition / lifting state up | responsibilities consuming each other's receipts |

Kubernetes' controller is a _weaker_ version of the same idea —
reconcile-to-desired-state with no render/commit split, no memoization, no
composition. It is a subset; a one-line footnote acknowledges the lineage.

The metaphor is **explicitly bounded**. React renders are synchronous, cheap,
and the tree does not mutate mid-render; OpenProse renders are expensive,
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
   never depends on a side effect. The author bounds that actuation in
   `### Invariants` — the rate, scope, and prohibited actions the render may not
   exceed — which the harness lowers and enforces as the render's actuation
   quarantine. (A harness that has not yet lowered this boundary must say so
   in its own status; until then it is authored prose the render is asked to
   honor.)
3. **Synchronous tree vs. asynchronous world.** A render's output is always
   `as_of` a timestamp, never "now." Every receipt carries `as_of`; that is where
   control-systems time-awareness patches React's frozen-tree assumption. (A
   receipt schema that does not yet carry `as_of` is a documented harness
   shortfall, not a language change — see *Open specification items*.)

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

1. **Receipt schema.** Every decision writes a
   content-addressed receipt: the `node`, its `contract_fingerprint`, the `wake`
   (`source ∈ {input, self, external}` plus the upstream `refs` that caused it),
   an `as_of` timestamp (the instant the truth is asserted as-of, never "now"),
   the `input_fingerprints` it depended on, the per-facet `fingerprints` it
   produced, a `status ∈ {rendered, skipped, failed}` carrying — on a `failed`
   receipt — a `reason` that names exactly what the render could not satisfy and
   the author it is addressed to, the `prev` link that makes
   the per-node chain verifiable, and a `cost` block (`provider`, `model`,
   `tokens.fresh` vs `tokens.reused`, `surprise_cause`) that makes the
   cost-scales-with-surprise and memoization proofs recoverable from a single
   receipt. A `sig` block where `scheme: "none"` carries a `null_reason` is a
   first-class, non-deceptive state. There is **no** `verdict`, no confidence or
   calibration grade, no `role` enum, and no `judge`/`policy-compile` cause —
   those were retired with the judge. The ledger is append-only and
   chain-verifiable. (A harness whose receipt is thinner — no `as_of`, no
   failure `reason`, no author-addressing field — must document that delta in
   its own status; the language's failed-receipt promise depends on closing it.)
2. **The cryptographic signer.** A cryptographic byte-hash signer — binding the
   published world-model to its receipt so cross-boundary trust is
   non-repudiable — and the composition pinning surface it backs (contract
   revision + acceptable signer set) are specified here and deferred. (Until a
   harness ships it, "signed" means meaning-layer chain-consistency over a null
   signer, not yet a byte hash — a harness must say which it provides.)
3. **Ledger compaction.** The receipt ledger grows without bound; an external
   compaction/indexing plan for long-running responsibilities is named roadmap,
   not shipped.
4. **Facet inference.** Facets are author-declared (`####` parts under
   `### Maintains`). Inferring a good facet split from a contract — proposing the
   material/immaterial boundary — is a deferred compile-phase enhancement.
5. **The fixpoint.** The topology-as-responsibility recursion (*The unification
   thesis*) — the system maintaining its own wiring as just another memoized
   render, with epoch rollover when the contract set changes — is specified and
   deferred past v1.
6. **Default freshness derivation.** A serve default that reconstructs each
   node's freshness schedule from a `valid_until` convention in published truth —
   so the common case self-paces with zero per-project wiring — is specified and
   deferred. (A harness that still serves on a fixed interval must document
   that shortfall.)

### Where it excels

The reusable judgment is in the properties, not a list of domains. Conforming
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
the cost differentiator and degrades gracefully to forecast-cadence cost. The
model excels where a cheap stable identity exists; semantic-only-drift domains are a
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
actually changed. Additional worked examples live in the example corpus under
`skills/open-prose/examples/`.

---

## Shipped harnesses

This document specifies; it does not track what any implementation has
shipped. A harness publishes its own measured conformance against the contract
above — which invariants it realizes, which open items it defers, what its
receipt carries today — in its own repository. The reference implementation is
listed in the repository README under *Harnesses*.
