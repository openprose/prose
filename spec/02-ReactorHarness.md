# OpenProse Reactor Harness

###### A Reactor-class harness for evented reconciliation of AI-maintained world state.

The OpenProse corpus divides labor exactly, and each document maps to what
ships:

- [01-Language.md](./01-Language.md) — **the Language & Framework**, bundled as
  the **SKILL**: syntax, kinds, sections, compile model, std/co, CLI surface.
- [02-ReactorHarness.md](./02-ReactorHarness.md) — **this
  document, the Reactor Harness**, bundled as the **CLI/Server**: the runtime
  control architecture — the loop, invariants, kernel, memoization, forecast,
  receipts, composition. It names the architectural class underneath
  continuous outcomes and answers _what the runtime must do_.
- [03-ReactorPattern.md](./03-ReactorPattern.md) — **the
  Reactor-Native Authoring Pattern**, **SKILL-bundled but harness-governed**:
  how to write `*.prose.md` so this harness's mechanisms engage. It bridges
  the Language doc and this doc.
- **Internal decision log** — not shipped: the dialectic that produced this
  revision. This document is the clean public statement and does not carry the
  dialectic.
- [00-Tenets.md](./00-Tenets.md) — **the constitution**. When any
  document tensions with a tenet, the tenet wins.

`ContinuousOutcomes.md` is out-of-scope ideation, not part of the runtime spec.

This file has three parts, kept structurally distinct so the document cannot
silently rot the way an earlier revision did:

1. **Ideal** — the Reactor-class harness as it *should* be. The vision; frozen.
2. **Current** — a code-grounded snapshot of what the `openprose/prose`
   repository *actually implements today*, named down to modules, types, and
   test counts. Mechanically re-derivable from the code.
3. **Roadmap (the Delta)** — what bridges Current → Ideal before OpenProse
   publicly launches the term with a technical report.

`Ideal − Current = Roadmap`. Part I never claims something shipped; Part II
never aspires.

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
judge drift, fulfillment completion, or retry outcome.

```text
event
  -> bounded judge or fulfillment activation
  -> durable status and evidence
  -> Reactor decision
  -> projected state
  -> scheduled judge, fulfillment, retry, escalation, or quiescence
```

The harness is "Reactor-class" when the policy for that loop is explicit,
typed, replayable, and shared across hosts. The model judges and fulfills
inside bounded activations; continuity lives in durable state, never in a
long-running session.

The distinction from a normal agent loop is the whole point.

A normal agent loop asks:

```text
What should I do next?
```

A Reactor-class harness asks:

```text
Given this responsibility, this event, the latest observations, and the prior
decisions, what reconciliation action is now justified?
```

That turns agent behavior from a running conversation into an inspectable state
transition.

### The unification thesis

The loop above is the **base case**. The full architecture is one mechanism
applied recursively:

> **Model-authored policy, compiled to a token-free deterministic registry,
> executed with memoization, forecast-gated scheduling, and confidence-gated
> depth.**

This single mechanism, seen from different sides, is the whole of Part I.
Two recursions wrap the base case:

- **Policy over time.** The control policy itself — cadence, hysteresis band
  shapes, escalation thresholds — is _authored by the model_, then _compiled_
  into a deterministic, replayable, token-free artifact that runs hot for a
  window. The mechanism is **Popperian**: the compiled policy ships _its own
  falsification predicate_ — the conditions, stated at author time, under which
  it admits it is wrong (observed drift exceeds its predicted curve; escalation
  precision falls below its claimed threshold; cost per maintained
  responsibility trends past its stated budget). The deterministic kernel is a
  dumb evaluator of that predicate against the receipt log, plus a **tiny fixed
  backstop that does not trust the predicate to be honest** (max policy age,
  min recompile interval, max calibration divergence, and
  rollback-to-last-known-good — a fresh policy that trips its own predicate
  faster than its predecessor auto-reverts). No model call decides whether to
  recompile: the model only authored the tripwire; the kernel checks whether it
  fired. This is the existing OpenProse compile step made continuous. The model
  owns _intelligence_ (policy authorship); determinism owns only _execution_ of
  model-authored policy. Tenet 2 is honored, not violated: a dumb fast
  mechanism with intelligent slow parameters. The original "Reactor decides
  from typed state" is the special case where the policy is fixed. The
  meta-loop has its own hysteresis so it does not recompile too eagerly, and
  policy artifacts get the same receipts and replay that responsibilities get
  (open items I.2, I.4).

- **Responsibilities over a graph.** A signed, content-addressed receipt is
  already a perfect evidence token. "B depends on A" means B's judge consumes
  A's latest receipt as an evidence source, identical to consuming a webhook.
  **The dependency graph is the evidence graph.** The original
  single-responsibility loop is the N=1 case.

You do not need to re-understand the core loop. You need to understand that it
is the base case of these two recursions. Everything else is presentation.

### The two compiles

OpenProse compiles twice. The two share one *doctrine* but are not one
*operation*; conflating them silently breaks audit, replay, and adaptivity.

| | Source-compile | Policy-compile |
| --- | --- | --- |
| Fires when | the author changed intent | the world drifted from what the policy predicted (the falsification predicate tripped) |
| Input | `*.prose.md` source only | contract **+ accumulated receipt history** |
| Question | "what did the author declare?" | "given the declaration *and everything observed*, what is the cheapest correct way to maintain it?" |
| Output | repository IR (structural lowering) | the token-free policy registry the kernel executes |
| Lifetime | until source changes again | until the predicate trips or the backstop fires |
| Correctness test | fidelity to source (deterministic validation) | calibration against reality (the falsification predicate) |

They cannot be merged, for three independent reasons. **Audit/replay:** "the
verdict changed because the author rewrote the criteria" and "the cadence
changed because calibration degraded" are different histories that must replay
against different recorded artifacts (invariant 8, Tenet 5). **Lifetime:** IR
is valid until source changes (perhaps months); the policy artifact until the
predicate trips (perhaps hours); one artifact cannot carry two validity clocks.
**Determinism boundary:** source→IR is a fidelity problem the CLI checks
deterministically; contract+history→policy is optimization under uncertainty
with no single correct answer, checked by the falsification predicate.

The lifecycle asymmetry is the proof they are distinct:

```text
t0     author writes contract  → SOURCE-compile → IR
                                → POLICY-compile (cold start) → seed policy
t0–30  no source edits; IR byte-identical all month
t12    judge calibration degrades       → predicate trips → POLICY-compile  (IR untouched)
t19    cost-per-maintained over budget  → predicate trips → POLICY-compile  (IR untouched)
       —— 30 days: SOURCE-compile 0×, POLICY-compile 2× ——
t31    author sharpens a criterion → SOURCE-compile → new IR + revision
                                    → may cascade → POLICY-compile
```

Source-compile can cascade into policy-compile; policy-compile never causes
source-compile; policy-compile fires many times between source edits. Two
operations with different invocation counts over the same window are not one
operation. The mental model: source-compile is the **compiler** (source →
bytecode; changes only when source changes); policy-compile is the
**profile-guided / JIT optimizer** (re-optimizes from the observed runtime
profile when the workload drifts). Mapped exactly: IR = bytecode, the receipt
log = the runtime profile, the policy registry = JIT-optimized code, the
falsification predicate = the deopt guard. Same toolchain, different stages,
both essential. The unification is at the doctrine layer (the thesis above),
deliberately; the operations stay two — as `map` and `filter` share a pattern
but are never collapsed into one function.

**Safety line.** *Both* compiles emit a **static artifact consumed and
validated by deterministic code** — the language is never on the execution or
safety path. A model authors; code validates the artifact; the kernel executes
it; the fixed backstop catches a bad artifact regardless of how it was
authored. This is the same safe pattern the existing source compiler already
uses (model-run, CLI-validated), applied a second time.

**The policy author is an agent, and its representation is sequenced.** Policy
authoring is inherently agentic: it must explore the receipt history
dynamically, not consume a one-shot stuffed context. That agent-ness is
non-negotiable from day one. Its *launch representation*, however, lives behind
the static-artifact boundary and is deliberately sequenced so the
safety-critical bootstrap does not depend on an unproven self-referential
layer:

1. **v0.1** — agentic author launched via the proven agent-session adapter;
   dynamic receipt-history exploration; cold start is a contract-only prior
   (the static seed). Code owns trigger evaluation, artifact validation,
   backstop, and rollback; the agent owns exploration and authorship.
2. **v0.2** — the same agent, now recurring: the kernel's falsification
   predicate triggers recompile; rollback-to-last-known-good and calibration
   scoring are active. Still adapter-launched.
3. **v0.3+** — once the Prose VM is proven, migrate the launch representation
   to a first-class OpenProse `kind: responsibility` ("the control policy for
   X stays current and well-calibrated") fulfilled by an agentic
   `kind: system`. Artifact format, kernel, and backstop are unchanged, so the
   migration is no-throwaway — the recursion closing on itself, and the end
   state that most proves the thesis.

Invariants across all three steps: the author is a real exploratory agent from
day one; it emits a static artifact validated by code; the language is never
on the execution or safety path; the representation lives behind the artifact
boundary — the same agent-SDK-adapter seam ratified in *Architecture* below.

### Quiescence

The headline behavior, and the clearest proof of the thesis:

> A normal agent loop's cost scales with wall-clock time. A Reactor's cost
> scales with surprise — plus a forecast-amortized plan-audit floor
> calibration drives toward, but never to, zero (see *The plan-completeness
> audit*).

Quiescence is not the absence of behavior; it is three explicit behaviors,
ordered by how much they save:

1. **Don't act.** Status is `up`; no fulfillment. The trivial case.
2. **Don't check now.** Forecast says drift probability stays low until time
   _T_; the next judge is scheduled at _T_ and the runtime sleeps. Zero tokens
   between, except the forecast-paced plan-audit floor (see *The
   plan-completeness audit*): provable quiescence is zero tokens *between
   forecast-paced plan audits*, not zero tokens on a static world.
   (= don't re-render until a dependency changes.)
3. **Don't check deeply.** When a check is due, run the cheapest sufficient
   judge; escalate depth only on uncertainty or stakes. (= don't re-render the
   whole tree, only the subtree that changed.)

The rigorous core is **memoization**: a verdict is keyed by the hash of its
inputs (contract revision + evidence receipts + dependency receipts). Unchanged
hash → the verdict is reused at zero token cost — `React.memo` semantics applied
to judgment.

**The completeness law.** A hash is only safe if it captures every input that
could change the verdict — the classic cache-invalidation trap, whose failure
is silent (confident staleness). The law that makes the hash complete _by
construction_: **shallow judging executes a compiled, stable evidence plan** —
the set of sources to consult is a function of the contract revision, authored
by the model at policy-compile time, not improvised per cycle. Only **deep**
(escalated) judging may roam; roaming that discovers a new dependency forces a
policy recompile that adds it to the plan. The memo key is therefore complete
relative to the current compiled plan, and plan-incompleteness is surfaced
through the deep-escalation-and-recompile path, never silently ignored. This
also protects the cost thesis: a judge that re-roamed every cycle would keep
the memo key unstable on a static world, collapse the hit rate, and kill "cost
scales with surprise" while every correctness test still passed.

**The plan-completeness audit.** The completeness argument above has a known
gap: deep roaming is the only path that discovers a missing dependency, yet
deep is gated on shallow confidence, and a memo key built from an _incomplete_
plan is stable-by-omission — it manufactures confidence and suppresses the
escalation that would expose its own incompleteness. Confident staleness is
otherwise merely relocated from the verdict to the plan. The law therefore
requires a **second forecast clock, paced on plan age rather than evidence
age**, that injects a synthetic input forcing a **deep, roaming revalidation
whose trigger is independent of the shallow judge's confidence**. This is the
same synthetic-input mechanism that makes silence safe against the
missing-webhook problem, retargeted from "the world changed without an event"
to "the plan may be incomplete without an escalation." When the plan-age clock
crosses threshold the runtime escalates regardless of shallow confidence; the
roam either confirms the plan complete (resetting the clock, recording a
receipt whose `surprise_cause` is `forecast-recheck` with `recheck_kind:
plan-age`) or discovers a dependency and forces a policy recompile.
The clock is itself a model-authored, calibration-scored policy parameter (a
falsification-predicate input under _The two compiles_), not a fixed
heartbeat: domains with cheap stable identities and low semantic drift earn
long audit intervals; semantic-drift domains are paced tighter.

The safety watch-out: memoizing on a stale input hash means the system could
quiesce confidently while the world changed silently because no event fired
(the missing-webhook problem). The defense is forecast: time since the last
true check raises drift probability even with zero events, and crossing the
forecast threshold injects a **synthetic input change** that breaks the memo.
Forecast's real job is to manufacture the minimum necessary re-render when the
world will not announce that it changed. That is what makes silence _safe_
rather than _negligent_.

### Core invariants

These are the constitution. Each survives the negation test: negate it and the
result is no longer a Reactor-class harness. Items that fail that test (a
negation that still yields a Reactor-class harness, only a worse-designed one)
are design defaults and live in **Architecture**, not here.

1. **Markdown is intent.** The source contract is the durable semantic object.
   Negate it and intent lives in a hidden surface — Tenet 1 broken.
2. **Policy is model-authored, compiled, and shared.** Reactor decisions are
   produced by one compiled policy artifact, identical on every host. Negate it
   and two hosts interpret policy independently — forked semantics.
3. **Adapters are the only reason hosts differ.** A clone and a long-lived
   deployment diverge only because storage, sandbox, signer, or connector
   adapters differ. Negate it and the loop has forked — Tenet 1 broken.
4. **Activations are bounded.** No continuity depends on one long-running model
   session. Negate it and it is an agent loop, not a Reactor.
5. **Cost scales with surprise.** A normal agent loop's cost scales with
   wall-clock time; a Reactor's cost scales with surprise plus a
   forecast-amortized plan-audit floor. Stated as a
   falsifiable challenge: **for every token, name the surprise.** Negate it and
   the differentiator is gone. Four backing commitments make this testable:
   - **No fixed-interval work.** The Reactor core spends zero tokens between
     scheduled checks. Forecast _replaces_ polling — polling is "I don't know
     when"; forecast is "I computed when." Where a source cannot push, polling
     is pushed to a gateway adapter and is itself forecast-paced, never a
     heartbeat.
   - **Memoization is real.** Unchanged input hash → reused verdict, provably
     zero judge tokens, recoverable from the fresh-vs-reused token ratio in the
     receipt.
   - **Depth is variable and confidence-gated.** Cheapest sufficient judge by
     default; ensemble only on uncertainty or stakes.
   - **Every token traces to a surprise-cause** ∈ {real input change,
     forecast-manufactured recheck, escalation}. The plan-completeness audit
     is a forecast-manufactured recheck paced on plan age, not a fourth
     cause; its tokens are the forecast-amortized plan-audit floor, not a
     counterexample to the claim.
6. **The judge fails safe.** Given the judge's calibrated confidence,
   uncertainty escalates rather than acts; conflicting evidence lowers
   confidence rather than averaging it away. "Calibrated confidence" means
   confidence whose calibration is measured, not assumed; an unvalidated or
   degraded confidence signal forces escalate-by-default, never quiesce (see
   _Failure model_, degraded-calibration mode). An uncalibrated confidence
   signal (no authored or accrued anchor) forces escalate-by-default
   *indefinitely*; calibration may be *earned* via accrued exogenous labels
   and is a property a responsibility can reach over time, not only a
   precondition — the gate is satisfiable in principle by every
   responsibility, never unsatisfiable-by-default. Negate it and a confidently
   wrong judge produces confidently wrong action — the class's safety claim is
   void.
7. **Receipts are content-addressed.** Consumers verify evidence instead of
   trusting the producer's claim. The receipt is simultaneously the audit unit, the
   composition unit, and the exit unit. Negate it and Tenets 5 and 6 break at
   once.
8. **State is replayable and exitable.** Given the same contract, event,
   durable state, and adapter outputs, the Reactor decision is reproducible —
   and the contract with its trail can leave for another harness. This is not
   "reproducible for us"; it is "exitable by you" (Tenet 6). Negate it
   and there is no fork-as-exit and no audit.

Demoted to design default (Architecture, not constitution): coarse status,
pressure-as-projection, tiered projection. Each is a strong default that can
change without breaking the class. Tiered projection is retained as a hard
privacy requirement in **Failure model**, not as a class-defining invariant.

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

| Layer              | Role                                                                                                                                                 | Serves beat                  |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Responsibility     | The standing goal: what must remain true                                                                                                             | author                       |
| Contract Markdown  | The durable human- and agent-readable source                                                                                                         | author                       |
| Gateway            | Concrete event ingress: schedules, webhooks, queues, files, manual requests; forecast-paced polling only where a source cannot push                  | walk away                    |
| Compiler           | Lowers semantic Markdown into deterministic IR                                                                                                       | author                       |
| Policy compile     | Model authors control policy; compiled to a token-free registry; recompiled when the policy itself drifts                                            | walk away                    |
| Storage            | Holds responsibilities, revisions, observations, runs, decisions, forecasts, receipts, projections                                                   | exitable trail               |
| Judge              | Bounded sensing activation; variable depth; emits status **and a calibrated confidence** (ensemble disagreement is the uncertainty signal)           | interrupted only when needed |
| Reactor            | Typed policy execution deciding the next reconciliation action; fails safe under uncertainty                                                         | interrupted only when needed |
| Forecast           | Load-bearing: manufactures the minimum necessary re-render when the world will not announce change; injects the staleness clock as a synthetic input | walk away                    |
| Fulfillment        | Bounded actuation; the only place world-mutation is allowed                                                                                          | walk away                    |
| Cost / token-truth | Local, deterministic, free token receipts; fresh-vs-reused recoverable                                                                               | verifiable trail             |
| Truth oracles      | One pluggable socket, two distinct concepts (see Failure model)                                                                                      | verifiable trail             |
| Projection         | Owner, subscriber, public, and local views                                                                                                           | exitable trail               |
| Receipt            | Content-addressed proof; carries `as_of`, `next_forecast_recheck`, and a judge-authored blocked reason + recommended fix target                       | verifiable / exitable trail  |
| Composition        | The dependency graph is the evidence graph                                                                                                           | author / verifiable trail    |
| Adapters           | Filesystem, Postgres, sandbox, connector, signer, event sinks                                                                                        | walk away                    |

The most important boundary is between semantic intelligence and harness
machinery:

```text
Markdown source defines intent.
Skill and interpreter docs define semantics.
The model authors policy; the compiler lowers it into IR.
The harness serves IR and runs the compiled policy.
Runs interpret and act inside bounded activations.
The Reactor reconciles. Receipts attest.
```

**Two adapter seams, never merged.** The bounded-activation **agent SDK**
(`codex-sdk`, `claude-sdk`, …) is an adapter and nothing more: no Reactor
control logic ever lives inside it — the kernel, memoization, forecast, and
policy execution are the package's, not the activation runtime's. Distinct
from it is the **model-gateway socket** (OpenRouter as the batteries-included
default; direct Anthropic/OpenAI first-class), which serves raw multi-provider
inference. It is the *inference substrate* the agentic activations draw on —
the judge ensemble's multi-provider votes and calibration, and the inference
consumed by the agentic policy author (which is itself launched via the
agent-SDK seam and explores receipt history dynamically, never a one-shot
call — see *The two compiles*). Keeping
the two seams separate is what makes the policy-author migration in *The two
compiles* free: the launch representation can move from an adapter call to an
OpenProse responsibility without touching the artifact, the kernel, or the
backstop. This is invariant 3 doing load-bearing work, not a convenience.

Design defaults that are not constitutional: status is coarse (`up`,
`drifting`, `down`, `blocked` route maintenance); pressure is a projection that
wakes work, not a second policy engine; projection is tiered.

The `blocked` status carries a judge-authored, natural-language reason **and a
recommended fix target**. "The sentence itself is undecidable — criterion X has
no observable referent" is an expected, high-value verdict, routed to the
contract author (Tenet 2). It is _not_ a new deterministic status; the four
coarse statuses stay minimal, and the differentiation lives in the judge's
diagnosis, not an enum. This is the flagship instance of "interrupt only when a
human is genuinely needed," not error handling.

**Interrupt taxonomy.** An interrupt is a typed Reactor decision with its own
receipt, never a generic action — there are no "just FYI" pings. Its cause is
one of exactly three: `needs-judgment` (a call only a human can make,
including the undecidable-contract case above and the
`calibration-unattainable` case from the failure model), `needs-input` (a credential,
permission, or disambiguation only the human can grant), or `contract-declared`
(escalation the author wrote into the contract, e.g. "page me if this goes
down"). The model **never invents an interrupt**: it self-initiates only for
the first two; `contract-declared` paging is user-authorized, not model-chosen.
The lived-experience promise's "exactly two conditions" refers to
self-initiated interrupts; contract-declared paging is the user's own rule
firing. Per the precedence stack, interrupt-minimization yields to safety.

### Failure model

The architecture must be safe when its own intelligence is unreliable. Two
independent layers:

- **Judge-quality layer.** Epistemically sound LLM-as-judge: the judge knows
  its observations are partial; inter-model consensus across model classes and
  sizes (critic, dialectic, K-consensus, fan-out) raises quality. Its real
  output is not just a verdict but a confidence signal. **Ensemble spread is
  the confidence estimator only in the regime where it is measured to be
  calibrated.** Calibration is not assumed; it is continuously measured against
  the bring-your-own-correctness-truth anchor and recorded as a receipt. While
  the measured spread→error relationship meets the calibration bar, no separate
  estimator is needed. When the bar is not met — including the no-anchor
  cold-start case — the judge enters **degraded-calibration mode** (defined
  below) and may not use low spread as a license to skip escalation:
  correlated models sharing training lineage can be confidently jointly wrong,
  so low spread is treated as evidence of confidence only after it has been
  shown to track error on this responsibility's anchor.
  **Ensemble diversity is a correctness requirement, not a tuning option.**
  Temperature/sampling diversity does not decorrelate shared training-data and
  RLHF blind spots and does not count toward the diversity floor: an ensemble
  qualifies as diverse only if it spans ≥2 model families from ≥2 providers and
  crosses a size boundary; the calibration receipt records the realized
  family/provider/size mix, and a single-family ensemble is automatically
  degraded-calibration regardless of measured spread. Judge ensembling is a
  model-gateway-socket concern, never an agent-SDK concern — it cannot be
  satisfied by the same model run through two agent adapters.
- **Degraded-calibration mode.** When measured calibration is below bar,
  calibration evidence is stale, or the diversity floor is unmet, the
  variable-depth judge degrades safely and the precedence stack governs:
  (1) **escalate-by-default** — low spread no longer authorizes the cheap path;
  default depth becomes the escalated ensemble, inverting quiescence behavior 3
  for that responsibility; (2) **weight the anchor** — where a correctness
  anchor exists its label overrides low-spread agreement for the affected
  verdict class, and anchor↔ensemble disagreement is itself a `blocked`
  interrupt routed to the author; (3) **widen the ensemble** — add an
  out-of-family provider via the model-gateway socket before trusting
  agreement; (4) if none of (1)–(3) is available, the responsibility runs in
  **bounded degraded-calibration mode**: escalate-by-default is the steady
  state and confidence is reported *uncalibrated* in every receipt — never a
  silent confident `up`. This mode is **not terminal-by-construction**: it is
  exited when accrued anchor labels (see *Truth oracles*) meet the calibration
  bar. (4b) It becomes a terminal `blocked` — reason `calibration-unattainable`,
  a `needs-judgment` interrupt routed to the author — only when
  escalate-by-default itself cannot run (no diverse ensemble obtainable): the
  system can neither self-assess nor safely escalate. The cost regression from
  escalate-by-default is the _correct_ outcome under correctness > safety >
  cost.
- **Reactor-safety layer.** Independent of judge quality: given that
  confidence, the control policy fails safe (invariant 6). The asymmetry
  between a wrong fulfillment and a wrong inaction is made explicit per
  responsibility — some fail loud, some fail quiet.

The judge is **not a fixed circuit, it is a variable-depth circuit**: cheap
single judge by default, escalate to ensemble only when uncertain or when
stakes or forecast warrant. This is simultaneously the failure-model answer and
the cost answer.

**Truth oracles — one socket, two distinct concepts.** A single pluggable
socket pattern (an external oracle the OSS _calls_ but never _owns_; null-safe
degradation; results flow back as receipt-attached projections) serves two
semantically orthogonal concepts that are **never merged in prose or types**:

- **Bring-your-own-correctness-truth.** Answers "was the verdict right?" Not
  merely a fallback — when present it is a **calibration anchor**: periodically
  score the ensemble against it to measure and correct ensemble bias over time;
  the scoring is itself a receipt. The anchor may be *authored* (the BYO
  oracle) or *accrued*. Accrued labels come from two exogenous sources: human
  confirm/refute responses to a `needs-judgment` calibration spot-check, and
  independently observed fulfillment outcomes. Ensemble-internal agreement —
  including deeper re-judgment — is **not** an anchor source: it measures
  coherence, not correctness, and is explicitly excluded. Accrued labels feed
  the same calibration scorer and receipt as an authored anchor; calibration
  grade is recorded (`authored` | `accrued` | `none`).
- **Bring-your-own-cost-truth.** Answers "what did it cost?" Token-truth is
  recorded locally and deterministically; dollarization is a projection applied
  by a pluggable price oracle. The OSS package is fully functional with no
  price oracle ("not configured" is a clean, non-deceptive null state, same
  honesty bar as the null-signer). Dollarization is a pluggable price-oracle
  projection, never a receipt field; a managed aggregation service is out of
  scope of this specification.

Bad correctness-truth corrupts judgments; bad cost-truth corrupts economics but
not correctness. Same plumbing, different shapes, different consumers, different
failure meanings.

**Cost is a first-class Reactor input, not a dashboard.** Token-truth receipts
feed the forecasted marginal value of the next check; the Reactor trades judge
depth against budget on that basis. Cost is read by the variable-depth judge
when deciding whether to escalate, and by the meta-loop when deciding whether a
recompile is worth its tokens. It is an input to control, not an after-the-fact
report.

**Privacy is a failure mode.** Secrets, emails, private URLs, and customer
payloads must not leak from judge rationale into subscriber or public
projections. Tiered projection is the safeguard: owner and local views may be
rich; subscriber and public views are explicit, narrowed contracts, not ad hoc
response filtering. A privacy leak is treated as a safety failure, not a
cosmetic one — this is the hard requirement referenced from **Core invariants**
where tiered projection was demoted from the constitution.

### Metaphor

Lead with React, and not for palatability — after the unification thesis it is
the _rigorous_ model, with literal mappings:

| React                          | Reactor                                                             |
| ------------------------------ | ------------------------------------------------------------------- |
| render                         | the compile / policy-derivation step                                |
| committed output               | the deterministic schedule + threshold registry                     |
| re-render                      | recompile, triggered by a dependency change, not a clock            |
| partial reconciliation         | quiescence; only changed subtrees re-judge                          |
| memoization / dependency array | input-hash verdict reuse                                            |
| render vs. effect              | judge (pure: world → status) vs. fulfill (commit-phase side effect) |
| composition / lifting state up | responsibilities consuming each other's receipts                    |

Kubernetes' controller is a _weaker_ version of the same idea —
reconcile-to-desired-state with no render/commit split, no memoization, no
composition. It is a subset; a one-line footnote acknowledges the lineage.

The metaphor is **explicitly bounded**. React renders are synchronous, cheap,
and the tree does not mutate mid-render; Reactor "renders" are expensive,
asynchronous, and the world mutates underneath them. So React owns the
**structural** dimension; **control-systems** language (forecast, hysteresis)
owns the **time/cost** dimension. Two metaphors, each owning exactly one
dimension. Three seams are where they meet, stated as resolution rules:

1. **Memoization vs. forecast.** On a quiet input, React says "skip"; control
   systems says "drift probability rose, re-check." Resolution: forecast
   injects the staleness clock as a **synthetic input** into the memo key, so
   "no real change but forecast says recheck" becomes a hash change. Control
   systems _feeds_ React; it does not override it. This is what makes silence
   _safe_ rather than _negligent_.
2. **Pure render vs. side-effecting world.** Judge stays pure (world → status);
   all world-mutation is quarantined in fulfillment (the commit phase), or the
   render-purity claim breaks.
3. **Synchronous tree vs. asynchronous world.** A verdict is always `as_of` a
   timestamp, never "now." Every receipt carries `as_of`; that is where
   control-systems time-awareness patches React's frozen-tree assumption.

### Composition

It needs **no new primitive**. "B depends on A" = B's judge consumes A's latest
receipt as evidence, identical to a webhook. Three consequences make it native,
not a bolt-on:

- **Propagation reuses memoization exactly.** A's new receipt is an input-hash
  change for B → B re-judges; if B is unchanged, propagation stops. The
  dependency graph reconciles by the same memoized partial-render mechanism as
  a single responsibility, recursively.
- **Cost amortizes for free.** A is judged once; N dependents reuse A's
  receipt. Dependency-graph amortization falls out of the architecture.
- **Fork/exit composes.** The edge is "consume receipt at content-address /
  responsibility-ref" — a reference, not a hidden binding. Public
  responsibilities become composable public goods (Tenets 5, 6 land on
  one object).

Three genuine collisions, with their resolutions:

1. **Cycles** (A→B→A). Detection is a graph property: deterministic and cheap;
   it belongs in the small fixed kernel.
2. **Cross-boundary trust.** B must verify A's receipt signature _and_ contract
   revision. A public A's owner can silently change semantics, so the
   dependency edge must **pin a contract revision and an acceptable signer
   set**, or composition becomes a supply-chain attack. This is where Tenet 5's
   "verify, don't trust" does real load-bearing work.
3. **Transitive staleness.** A quiesced A may hand B a stale-but-true-looking
   receipt. Each receipt's `freshness` block carries `as_of` and
   `next_forecast_recheck`. The rule by which B combines its own `as_of` with
   each consumed receipt's `freshness` to decide whether its inputs are fresh
   enough is **not at the judge's discretion and not a fixed kernel
   constant**: it is a **model-authored policy parameter recorded in the
   policy registry** — the *transitive-freshness function* — alongside
   cadence, hysteresis, and the plan-audit clock as a falsification-predicate
   input under *The two compiles*. The kernel is its dumb evaluator. The
   conservative default the model authors against, and the backstop the
   kernel enforces regardless of the authored function, is: *B's inputs are
   stale, and B must refetch or block, if any consumed receipt's
   `next_forecast_recheck` is at or before B's evaluation `as_of`.* The model
   may author a *looser* bound only where the contract's freshness criterion
   justifies it and the falsification predicate scores that looseness against
   observed downstream drift; never looser than the kernel backstop. For a
   chain A→B→C this composes by construction: each hop applies its own
   recorded function to its own consumed receipts, every one replayable
   against a pinned policy revision. Freshness is therefore transitive **and
   explicit in the schema and the policy registry** — never a discretionary
   per-cycle judgment (invariant 8, Tenet 6).

### Open specification items

Deferred by design — named here so they are tracked, not invented or silently
dropped:

1. **Receipt schema — v0 pinned; provider-normalization sub-object deferred.**
   The receipt schema is **pinned at v0** (`openprose.receipt`, `v: 0`): a
   content-addressed `core` (responsibility id, pinned contract revision, event
   cause ∈ {real-input, forecast-recheck, escalation} (a `forecast-recheck`
   additionally carries `recheck_kind ∈ {evidence-age, plan-age}` so the
   plan-audit floor is sliceable from ordinary forecast rechecks without a
   fourth top-level cause), memo key, evidence input
   ids, `as_of`, role ∈ {judge, fulfill, summarize, policy-compile}) hashed
   under a named algorithm; a `sig` block where `scheme: "none"` with a
   `null_reason` is a first-class, non-deceptive state alongside an optional
   signer adapter; a `verdict` carrying one of the four coarse statuses, calibrated
   confidence with its derivation method plus calibration grade
   (`authored` | `accrued` | `none`) and label source, and a judge-authored
   `blocked` reason + fix target + interrupt cause; a `freshness` block
   carrying `as_of`, `next_forecast_recheck`, and — on a receipt produced by a
   B that consumed upstream receipts — `transitive_freshness_policy_ref` (the
   policy revision whose transitive-freshness function was applied) and
   `consumed_freshness_evaluated` (per consumed receipt, its
   `next_forecast_recheck` and the kernel's staleness outcome ∈ {`fresh`,
   `stale-refetched`, `stale-blocked`}); a `composition` block whose `consumed_receipts`
   each pin upstream content-hash, contract revision, and acceptable signer
   set, plus a kernel-set cycle-checked flag; and a `cost` block where
   token-truth is sliceable along provider, model, role, tags, responsibility,
   run, and time, with `tokens.fresh` vs `tokens.reused` and a `surprise_cause`
   making the cost-scales-with-surprise and memoization proofs recoverable from
   a single receipt. Tags are not optional metadata; they are what lets cost be
   sliced after the fact. **The only deferred element is the contained
   `cost.provider_norm` sub-object** — cache-write vs cache-read price, TTL, and
   minimum-cacheable thresholds normalized across Anthropic/OpenAI/Gemini/Grok
   — which awaits the unrun provider/model matrix and carries its own
   independent `schema` version so provider research changes that sub-object
   alone, never the receipt shape. Dollarization remains a pluggable
   price-oracle projection, never a receipt field; a managed aggregation
   service is out of scope of this specification. This deferral is
   non-blocking: the v0.1/v0.2 policy-author milestones and the composition,
   supply-chain, and exit/export claims depend only on pinned fields.
2. **The deterministic kernel.** Specified in principle (see _The unification
   thesis_ and _Quiescence_): a dumb evaluator of the policy's
   model-authored falsification predicate, plus a tiny fixed backstop (max
   policy age, min recompile interval, max calibration divergence, warmup
   length, rollback comparison) and cycle detection. The backstop constants are
   pinned conservative-by-default and tuned empirically: **max policy age** — a
   hard ceiling forcing recompile/revalidation regardless of predicate state
   (seed: 30 days); **min recompile interval** — anti-thrash floor and
   meta-loop hysteresis (seed: 1 hour); **max calibration divergence** —
   observed drift exceeding the policy's predicted curve by ≥2×, or escalation
   precision falling materially below the policy's claimed threshold, forces
   recompile; **max calibration-evidence age** — if the correctness anchor has
   not scored the ensemble within this age, calibration is presumed stale and
   degraded-calibration mode engages (see _Failure model_). **Rollback-
   comparison definition:** _last-known-good_ is the most recent policy that
   completed its full warmup without tripping its own falsification predicate;
   a fresh policy `P_n` auto-reverts to `P_{n-1}` if `P_n` trips its own
   predicate in **fewer judged activations** (event-volume-normalized, not
   wall-clock) than `P_{n-1}` took to first trip its own. All constants are
   policy-registry-recorded and replayable; tightening them is a backstop
   change, not a policy recompile. **No-anchor soundness additions:** (B1) for
   a responsibility with no correctness anchor, `max policy age` is replaced by
   `max policy age (no-anchor)` — seed 7 days — because the anchor-derived arms
   (calibration divergence, calibration-evidence age, rollback) are inert in
   that regime. (B2) Independent of the policy's falsification predicate and of
   any model-authored clock, the kernel forces a deep, roaming revalidation at
   a fixed cadence (`max-unforced-deep-interval`, seed 7 days,
   event-volume-normalized); if its verdict materially contradicts the
   shallow-policy history the kernel records a `backstop-divergence` receipt
   and forces recompile — supplying the observed-vs-predicted term an
   anchorless calibration check otherwise lacks. (B3) A policy artifact is
   rejected at validation if its falsification predicate references no live
   observable (no anchor, no calibration-divergence input, nor — for a
   no-anchor responsibility — the B2 contradiction signal): a predicate
   falsifiable against nothing is malformed, not valid. B2+B3 ship together;
   B1 is the interim fallback. These are fixed kernel constants the model may
   not lengthen.
3. **Calibration cadence.** How often the ensemble is scored against
   bring-your-own-correctness-truth is unspecified.
4. **Meta-loop hysteresis.** "Do not recompile policy too eagerly" is a
   principle, not yet a parameter.
5. **Policy-registry artifact format.** The token-free deterministic registry
   the kernel executes is owned by `@openprose/reactor` (not IR, not
   `*.prose.md` syntax — see [01-Language.md](./01-Language.md) Part III §3). Its
   lifecycle, trigger, input, and correctness test are specified in _The two
   compiles_; its **on-disk format/schema is deferred**. Like the receipt
   schema (item 1) it is expected to be largely deducible — a versioned static
   artifact, validated by deterministic code, replayable, receipted, carrying
   the model-authored falsification predicate and the policy parameters
   (cadence, hysteresis band shapes, escalation thresholds, the plan-audit
   clock from _The completeness law_). It must meet the same "static artifact
   consumed and validated by deterministic code" safety bar as the receipt.
   Penciling a v0 here is a tracked follow-up and is not believed to be a
   blocker.
6. **Accrued-anchor calibration bar.** How many exogenous labels (human
   spot-check confirmations or observed fulfillment outcomes), over what
   window, at what agreement, lifts a no-anchor responsibility out of
   bounded degraded-calibration mode, and the spot-check sampling cadence,
   is unspecified. Distinct from item 3 (which governs *authored*-anchor
   scoring cadence and presumes an anchor exists); cross-reference both ways.

### Where it excels

The reusable judgment is in the properties, not a list of domains. Reactor-class
harnesses are strongest when:

- the goal is a **state to maintain**, not a one-shot deliverable;
- events arrive over time from multiple sources;
- the world state is partly ambiguous and requires judgment;
- the system must avoid duplicate or thrashing actions;
- the value of acting depends on freshness, confidence, risk, or cost;
- the user needs an audit trail for why an action happened;
- the implementation may change while the declared intent stays stable;
- multiple models may perform differently across judging, fulfillment, and
  summarization.

Weak fits: one-off report writing; pure batch transforms; low-stakes throwaway
prompts; deterministic jobs that need no judgment; workflows where every step
is already known and stable; tasks where public receipts or durable state add
more friction than value. OpenProse can still run one-shot services; they are
just not the canonical case.

Three costs are now structurally irreducible and must be stated honestly. **A
plan-revalidation tax:** provable quiescence is "zero tokens _between
forecast-paced plan audits_," not "zero tokens on a static world." The honest
claim is _cost scales with surprise plus a forecast-amortized plan-audit
floor_ — the floor pushed arbitrarily low (never to zero) by calibration, as
a plan that has survived N audits unchanged earns a longer interval. **A
no-cheap-hash domain boundary:** where deciding "did the semantically relevant
content change" essentially _is_ the judgment (research novelty, regulatory
drift, competitive framing), no cheap-and-complete identity exists; the system
stays correct and safe (forecast still manufactures the recheck) but loses the
cost differentiator and degrades gracefully to forecast-cadence cost. Reactor
excels where a cheap stable identity exists; semantic-only-drift domains are a
documented boundary, not a hidden failure. **A no-anchor calibration tax:** a
responsibility with no authored correctness anchor runs permanently
escalate-by-default until it accrues enough exogenous labels (human spot-check
or observed fulfillment outcome) to earn calibration. Like the no-cheap-hash
boundary this is a stated, deliberate correctness > cost trade, not a hidden
failure; some responsibilities (projection-only, slow-feedback, spot-check
declined) never accrue labels and remain in this mode by design.

One worked example, kept here because it demonstrates the thesis better than
any other — the world mutates with every message, so cost must scale with
surprise, not time:

#### Incident Briefing Room

```text
Goal: The incident channel has an accurate current briefing.
Continuity: Recheck on incident messages, status-page changes, and every 15 minutes while active.
Criteria: impact, timeline, owner, next action, and customer-facing status are current.
Fulfillment: summarize new facts, ask for missing owner input, update the briefing.
```

The modeled world changes with every message. The desired output is not "answer
once"; it is "keep the briefing true" while spending tokens only on what
actually changed. Additional worked examples are catalogued in Part II.

---

## II. Current — What the Code Implements Today

This section is a **code audit**, not a status memo. It describes the
`openprose/prose` repository (`main`, HEAD `52724ed`, tag
`reactor-v0.1.0`) as it stands: the
`@openprose/reactor` package, the `@openprose/reactor-cradle` evaluation
harness, and the `@openprose/prose-cli` Reactor path. Every claim names a
module, type, or test count and is re-derivable from the tree. Where the code
does not yet reach the Ideal, the Conformance Ledger says so.

> **One package, not the package the older spec named.** Earlier revisions of
> this document described a shared `@openprose/responsibility` package and a
> `platform/`-rooted layout. **Neither exists in the public repository.** The
> runtime wave deleted `@openprose/responsibility`; the typed Reactor authority
> is now `@openprose/reactor`, a greenfield package built directly against
> Part I. The CLI depends on it as `"@openprose/reactor": "workspace:*"`. All
> module paths below are real and rooted at the repository, not at a private
> `platform/` tree.

### Repository surface

| Surface | What exists today |
| --- | --- |
| Reactor package | `packages/reactor/` — `@openprose/reactor`, version `0.1.0`, MIT, zero runtime dependencies, published to npm with provenance. Thirteen subpath exports: `receipt`, `cost`, `kernel`, `evidence-plan`, `memo`, `forecast`, `sdk`, `reactor`, `judge`, `adapters`, `policy`, `composition`, `projection`. |
| Cradle package | `packages/reactor-cradle/` — `@openprose/reactor-cradle`, the evaluation/eval-double harness: synthetic worlds, baselines, scenario runner, provider-parity, live-spike recorders. Depends on `@openprose/reactor`. |
| CLI | `tools/cli/` — `@openprose/prose-cli`. Commands: `prose compile`, `prose serve`, `prose status`, plus `prose doctor`. The serve path imports `@openprose/reactor` directly. |
| Other workspace packages | `packages/std`, `packages/co` (Language-side, out of scope for this document). |
| State layout | The CLI writes package-owned Reactor state under the OpenProse root (`state/reactor/`), plus per-responsibility projections under `state/responsibilities/{id}/`. The repository ships no Postgres adapter. |
| Agent hosts | The CLI carries `claude-sdk`, `codex-sdk`, and `mock` harnesses (`tools/cli/src/harnesses/`). |

Test counts, run against HEAD `52724ed` via each package's documented
`pnpm … test` (typecheck + `node --test` over built `dist`, or `vitest` for
the CLI):

- **`@openprose/reactor`** — **155 tests, all passing.** 19 spec source
  modules under `packages/reactor/src/*/__tests__/`.
- **`@openprose/reactor-cradle`** — **121 tests, all passing.** 32 test files,
  including 10 `*.integration.test.ts` scenarios (B1–B7, C2, C5, E1, E2, W7).
- **`@openprose/prose-cli`** — **284 tests across 26 files, all passing.**

This is unit-, contract-, and integration-verified substrate. It is **not yet
an empirical proof of the category thesis**: the cost-scales-with-surprise
numbers below are produced by deterministic replay against synthetic worlds and
recorded cassettes, not by live multi-provider judging at scale.

### Receipt v0 — `packages/reactor/src/receipt/`

The receipt schema of *Open specification item I.1* is **implemented and
pinned**. `RECEIPT_SCHEMA = "openprose.receipt"`, `RECEIPT_VERSION = 0`,
`RECEIPT_HASH_ALGORITHM = "sha256"`. `ReceiptV0` carries the six blocks the
Ideal specifies — `core`, `sig`, `verdict`, `freshness`, `composition`,
`cost` — plus `content_hash`.

- **Content addressing is real.** `computeReceiptContentHashV0` canonicalizes
  the payload (sorted keys, `undefined` rejected, non-finite numbers rejected)
  and SHA-256-hashes it; `createReceiptV0` self-verifies on construction and
  throws on any malformed input. `verifyReceiptV0` recomputes the hash and
  rejects a mismatch, unpinned keys, or a wrong shape.
- **`core`** carries `event_cause ∈ {real-input, forecast-recheck,
  escalation}`; a `forecast-recheck` is required to carry
  `recheck_kind ∈ {evidence-age, plan-age}` and any other cause is forbidden
  from carrying it — the plan-audit floor is sliceable without a fourth
  top-level cause, exactly as the Ideal requires. `role ∈ {judge, fulfill,
  summarize, policy-compile}`.
- **`sig`** — the null signer is a first-class, non-deceptive state.
  `NullReceiptSignatureV0` is `{scheme: "none", null_reason}`;
  `createNullSignerReceiptSignatureV0` stamps reason
  `"no-signer-adapter-configured"`. A non-null `AdapterReceiptSignatureV0`
  shape is *typed* but **rejected at validation**: `validateSignature` pushes
  the error *"non-null signatures are not supported in receipt v0.1; null
  signer is the only honest v0.1 state."* Cryptographic signing is Roadmap.
- **`verdict`** — one of the four coarse statuses; `confidence` with `value`,
  `derivation_method`, `calibration_grade ∈ {authored, accrued, none}`, and
  `label_source`; a `blocked` block (required iff status is `blocked`) with
  `reason`, `fix_target`, `interrupt_cause ∈ {needs-judgment, needs-input,
  contract-declared}`.
- **`freshness`** — `as_of`, `next_forecast_recheck`,
  `transitive_freshness_policy_ref`, and `consumed_freshness_evaluated` (per
  consumed receipt: `receipt_hash`, `next_forecast_recheck`,
  `staleness_outcome ∈ {fresh, stale-refetched, stale-blocked}`). When
  receipts are consumed the transitive-freshness policy ref and a
  per-consumed-receipt evaluation are *required* by `validateComposedFreshness`.
- **`composition`** — `consumed_receipts` each pinning
  `upstream_content_hash`, `contract_revision`, and a non-empty
  `acceptable_signer_set`; plus a `cycle_checked` boolean.
- **`cost`** — token-truth: `provider`, `model`, `role`, `tags`,
  `responsibility_id`, `run_id`, `as_of`, `tokens.{fresh,reused}`, and
  `surprise_cause`. Sliceable by every dimension the Ideal names.
- **The single deferral matches the Ideal.** `cost.provider_norm` is an
  optional sub-object validated only for a `schema` string. Its full
  cross-provider normalization (cache-write/read price, TTL, minimum-cacheable
  thresholds) is the one deferred element of I.1 — present as a typed slot,
  unfilled.
- **Inspection / proof surface.** `inspectReceiptProofV0` and
  `ReceiptProofInspectionV0` give a non-throwing audit view; `serializeReceiptV0`
  emits canonical bytes.

Receipt module: 15 test groups in `receipt/__tests__/receipt.test.ts`.

### The deterministic kernel — `packages/reactor/src/kernel/`

The kernel of *Open specification item I.2* is **implemented**, including the
B1/B2/B3 no-anchor additions.

- **`KERNEL_BACKSTOPS`** pins the seed constants from I.2 exactly:
  `maxPolicyAgeMs` 30 days, `maxPolicyAgeNoAnchorMs` 7 days,
  `minRecompileIntervalMs` 1 hour, `maxCalibrationDivergenceMultiplier` 2,
  `maxUnforcedDeepIntervalMs` 7 days.
- **`KERNEL_MAY_NEVER`** is a 14-entry frozen list of prohibitions (the kernel
  may never author judgment, call a model to decide a backstop, lengthen a
  backstop, quiesce on missing safety-critical inputs, emit confident `up`
  under degraded calibration, …). A test —*"may-never list preserves W2
  prohibitions as executable contract checks"* — keeps it load-bearing.
- **Predicate evaluator.** `evaluatePredicate` is a dumb evaluator of a typed
  `KernelPredicateExpression` (`equals`, `not-equals`,
  `greater-than-or-equal`, `less-than`, `and`, `or`, `not`) against
  `KernelFacts`. Its three-valued `PredicateOutcome` —
  `not-tripped | tripped | indeterminate` — fails closed: a malformed
  expression or a missing fact is `indeterminate`, never silently false.
- **`evaluateBackstops`** is gated by a `ValidatedKernelPolicyArtifactToken`
  (a branded, frozen token only `validateKernelPolicyArtifact` can mint —
  raw policy artifacts cannot reach the evaluators). It fails *closed*: a
  missing calibration-evidence seed, missing warmup seed, or missing
  no-anchor deep baseline each produce a backstop outcome rather than silence.
- **B1/B2/B3.** `validateKernelPolicyArtifact` **rejects** a policy whose
  falsification predicate references no live observable (B3), and **requires**
  a no-anchor policy to ship a `backstop_divergence_predicate` that itself
  references a live observable (B2). `evaluateBackstopDivergencePredicate`
  evaluates only the validated, frozen predicate and emits a content-addressed
  `force-policy-recompile` safety receipt when it trips. The no-anchor 7-day
  forced-deep cadence (B2) and 7-day no-anchor policy-age ceiling (B1) are
  enforced in `evaluateBackstops`.
- **Rollback.** `compareRollback` decides
  `rollback | keep-current | no-last-known-good` strictly by *judged-activation
  count* — `JudgedActivations` is a branded integer; a test asserts wall-clock
  duration is never used.
- **Cycle detection** — `detectReceiptCycles` is a deterministic DFS over
  content-addressed receipt edges, order-independent, failing closed on
  malformed edges.
- **Fail-safe receipts.** `createKernelSafetyReceipt`,
  `resolvePersistentIndeterminate` (a bounded-`indeterminate` →
  `needs-judgment` primitive), and the divergence path all emit real receipt
  v0 entries with `verdict.status = "blocked"` and zero tokens.

Kernel module: 19 test groups in `kernel/__tests__/kernel.test.ts`.

### Memoization — `packages/reactor/src/memo/`

The memoization core of *Quiescence* is **implemented as a primitive**.

- **`computeMemoKeyV0`** hashes a normalized `MemoKeyInputV0` —
  `contract_revision` + a deduplicated, sorted set of `evidence_receipts` +
  sorted `dependency_receipts` — under schema `openprose.memo-key`, `v: 0`.
  The key is complete relative to its declared inputs by construction.
- **`InMemoryMemoStoreV0`** is namespaced by
  `(policy_artifact_namespace, policy_artifact_revision)` — a policy recompile
  changes the namespace and so cannot reuse a stale verdict.
- **`createMemoHitReceiptV0`** emits a receipt with
  `cost.tokens = {fresh: 0, reused: <prior total>}` and provider `memo` —
  the fresh-vs-reused proof the Ideal calls for. A memo hit is provably
  zero fresh judge tokens.
- The runtime (`reactor/index.ts`) uses this primitive: on an unchanged
  evidence hash a forecast evidence-age recheck produces a memo-hit receipt
  with `fresh = 0`.

Memo module: 5 test groups in `memo/__tests__/memo.test.ts`.

### Forecast-gated scheduling — `packages/reactor/src/forecast/`

`evaluateForecastScheduleV0` is **implemented**. It carries a
`ForecastScheduleStateV0` with two independent clocks —
`next_evidence_recheck` and `next_plan_recheck` — exactly the *second
forecast clock* the plan-completeness audit requires. When neither clock is
due it returns `outcome: "sleep"` with zero token-bearing receipts; when a
clock crosses it returns `manufacture-recheck` with synthetic
`forecast-recheck` receipts tagged `recheck_kind`. The `adversarial-silent`
reason path (no real input observed yet a clock crossed) is distinguished from
the ordinary `forecast-clock-crossed` reason. Forecast is the
synthetic-input mechanism that makes silence safe.

Forecast module: 4 test groups in `forecast/__tests__/forecast.test.ts`.

### Compiled evidence plan — `packages/reactor/src/evidence-plan/`

The *completeness law* — shallow judging executes a compiled, stable evidence
plan; only deep roaming may discover new sources — is **implemented**.
`executeShallowEvidencePlan` walks a `CompiledEvidencePlan`'s declared sources
and fails safe (a kernel safety receipt) if a required source has no collector
or produces an unverifiable receipt. `reconcileDeepRoam` returns
`force-recompile` when deep roaming discovers a source outside the compiled
plan — plan-incompleteness is surfaced through recompile, never silently
swallowed. The memo key cannot be patched in place; this is enforced by
construction.

Evidence-plan module: 7 test groups.

### The judge — `packages/reactor/src/judge/`

The judge is **partially implemented and explicitly bounded to shallow depth.**
`runShallowJudgeV0` calls the model-gateway adapter for a single shallow
verdict and returns a `ReceiptVerdictV0` plus token-truth usage. **It throws
`"not-implemented-in-v0.1"` for `depth: "ensemble"`.** The variable-depth,
multi-provider, calibration-scored judge ensemble of the *Failure model* —
the diversity floor, degraded-calibration ladder, ensemble-spread confidence
estimator — is **not implemented as a runtime judging path**. Every shallow
verdict is emitted with `calibration_grade: "none"` and label source
`no-anchor-v0.1`. Ensemble judging exists only as the recorded K1 calibration
cassettes in the Cradle (see *Evaluation harness* below).

Judge module: 1 test group.

### The Reactor runtime — `packages/reactor/src/reactor/` and `sdk/`

`createReactor` (in `sdk/`) returns a `ReactorSdkV0` handle —
`{adapters, ingest, tick, receipts, registry, export}` — and is the public
runtime entry. `createRuntimeReactorV0` wires the modules into a real loop:

- **`ingest(event)`** normalizes a typed turn (`real-input`,
  `forecast-recheck`, `escalation`), selects evidence from the compiled plan,
  verifies dependency receipts and runs cycle detection, looks up the memo
  store, invokes the shallow judge on a miss, and appends a verified receipt.
- **`tick(as_of)`** is the bounded scheduler: it reads the forecast schedule,
  manufactures due rechecks, and runs the policy recompile/rollback loop.
- **Cold start** authors a policy on the first real input:
  `authorPolicyArtifactV0` is invoked **once** through the agent-SDK adapter,
  the artifact is validated, and revision `1` is persisted before any judging.
- **Export/import.** `export()` builds a `ReactorExitBundleV0` —
  contract revision, active policy artifact bytes, all receipts, dependency
  pins, runtime registry, memo namespace binding — and
  `importReactorExitBundleV0` hydrates a fresh reactor from it. A test
  confirms an imported runtime-produced log produces the *same next
  deterministic receipt hash* as the original: replay/exit is real for the
  shipped path.

Reactor module: 23 test groups; SDK module: 18.

### Policy — `packages/reactor/src/policy/`

The policy layer is **implemented as a one-shot cold-start author plus the
recompile/rollback decision machinery; the recurring two-timescale loop is
partial.**

- **`authorPolicyArtifactV0`** runs a two-step agentic exchange
  (history-query, then author-artifact) through the agent-SDK adapter — the
  exploratory-agent shape of *The two compiles* v0.1.
- **`validatePolicyArtifactV0`** validates the authored artifact against
  schema `openprose.reactor.policy-artifact`, `v: 0`.
- **`derivePolicyDriftFactsV0`**, **`evaluatePolicyDriftV0`**,
  **`planPolicyRecompileV0`**, **`executePolicyRecompileV0`**, and
  **`planPolicyRollbackV0`** implement the drift-detection, recompile, and
  rollback decision functions. They are exercised by `policy-drift`,
  `policy-recompile`, and `policy-rollback` tests (5 + 6 + 5 groups) and by
  the Cradle `recompile`, `rollback`, `policy-drift`, and `policy-replay`
  integration scenarios.
- **Partial**: the runtime cold start authors policy revision `1` once. The
  *recurring* model-authored recompile-on-drift loop — the predicate tripping
  in production and re-invoking the author over accumulated history — is the
  v0.2 milestone of *The two compiles*; the decision functions exist and are
  unit/integration tested, but they are not yet driven by a live standing
  loop.
- The `transitive_freshness_function` is a model-authored policy parameter
  with a `DEFAULT_TRANSITIVE_FRESHNESS_FUNCTION_V0`, recorded in the registry.

### Composition — `packages/reactor/src/composition/`

Composition-via-receipts is **implemented**. `verifyUpstreamReceiptDependencyPinV0`
fails closed on supply-chain mismatches (content hash, contract revision, or
signer outside the pinned set). `evaluateTransitiveFreshnessV0` applies the
recorded transitive-freshness function with the kernel-backstop default
(`stale-blocked` at the forecast boundary), honors a stricter authored
minimum, and records `stale-refetched` replacements.
`computeDownstreamComposedMemoKeyV0` and `planCompositionPropagationV0`
make a dependent re-judge on an upstream receipt change and stop on a memo
hit — propagation reuses memoization exactly. The Cradle E1/E2 integration
tests compose an A/B/C chain through receipt pins, prove one upstream receipt
amortizes across N downstream memo-hit propagations, and exercise
fork/exit carry-over.

Composition module: 15 test groups.

### Projection — `packages/reactor/src/projection/`

Tiered projection (the *Privacy is a failure mode* requirement) is
**implemented**. `projectReceiptV0` and `projectReceiptProofV0` emit
`owner | subscriber | public` projections under schema
`openprose.reactor.receipt-projection`, `v: 0`. Owner projections may carry
rich verdict data; subscriber and public projections are explicit narrowed
contracts, not ad-hoc filtering. The CLI wires `prose status
--tier=owner|subscriber|public` over this surface, and a secret-injection
test proves secret-shaped tags and rationale do not reach subscriber/public
output.

Projection module: 7 test groups.

### Cost / token-truth — `packages/reactor/src/cost/`

The cost-thesis verification surface is **implemented**.
`ALLOWED_SURPRISE_CAUSES_V0` pins the three causes;
`validateReceiptSurpriseAttributionV0` and
`evaluateSurpriseAttributionCompleteV0` check that every token-bearing receipt
names a surprise cause; `evaluateFlatSpendUnderStaticV0` checks that spend
stays flat under a static world. These are the deterministic helpers the
*cost scales with surprise* invariant is tested against.

### Adapters — `packages/reactor/src/adapters/`

Eight adapters ship, all injected with no hidden defaults (the SDK fails
closed if a slot is missing): `clock-system` (system + fixed clocks),
`storage-fs`, `storage-memory`, `model-gateway-record-replay`,
`agent-sdk-passthrough` (passthrough + null), `sandbox-null`,
`connector-static`, `event-sink-memory`. The signer adapter is *typed only*
as `NullReceiptSignatureV0` — there is no cryptographic signer adapter and no
Postgres storage adapter in the repository. The two adapter seams of the
Ideal are present and distinct: the **agent-SDK seam**
(`ReactorAgentSdkAdapterV0`, used by the policy author) and the
**model-gateway socket** (`ReactorModelGatewayAdapterV0`, used by the judge).

### The Cradle — `packages/reactor-cradle/`

The Cradle is the **evaluation harness**: synthetic worlds, baselines, and
scenario runner that the cost thesis is measured through. It is not part of
the shipped runtime.

- **Synthetic worlds** (`world/`, `scenario/`) — `static`,
  `periodic-surprise`, and `adversarial-silent` profiles; a static world
  rejects material source changes rather than manufacturing surprise.
- **Baselines** (`baselines/`) — `no-memo` and `naive-loop` controls plus a
  `cost-thesis` summary builder. **These are controls, not shipped runtime
  modes.**
- **W7 static-world run** (`__tests__/w7-static-cost.integration.test.ts`) —
  drives a real `createReactor` handle through a static scenario and reads
  `reactor.receipts()`. Observed token shape: bootstrap real-input
  `fresh = 41`; evidence-age rechecks `fresh = 0` with positive reused
  tokens; plan-age audit floor `fresh = 5`. The C5 cost-thesis summary row is
  **runtime-produced** at `46:46` (fresh:reused) for the Reactor, against
  the same-unit `92:0` simulated no-memo and `92:0` naive-loop controls.
- **C5 event-changing run** — Reactor `74:74` runtime-produced, no-memo
  `148:0` simulated, naive-loop `148:0` control.
- **K1 live calibration cassette** — `spikes/fixtures/k1-live-recorded.json`
  is one recorded OpenRouter ensemble spanning
  `google/gemini-3.1-flash-lite-preview`,
  `mistralai/mistral-small-3.2-24b-instruct`, and
  `qwen/qwen-2.5-72b-instruct` (provider + family + size diversity),
  accepted by the K1 evaluator. This is *recorded calibration evidence*, not
  a live runtime variable-depth ensemble judging path.
- **Provider parity** (`provider-parity/`) — two named provider/model paths
  produce byte-identical policy-artifact bytes with fail-closed provider
  drift. This is *recorded* provider parity, not live provider support.

### CLI Reactor path — `tools/cli/src/prose/`

`prose serve` is no longer an agent-interpreted Reactor; it runs the
`@openprose/reactor` package as the typed authority. The bridge
(`responsibility-reactor.ts`, `repository-serve-reactor-adapters.ts`,
`repository-serve.ts`, `repository-serve-daemon.ts`) converts local
responsibility status into Reactor inputs, calls `createReactor`, and mirrors
compact projections under `state/reactor/` and
`state/responsibilities/{id}/`. It implements the operational scars:
crash-window replay (restart after a post-pressure-claim/pre-fulfillment
crash converges within one cycle), durable pressure dispatch claims,
restart recovery for scheduled work, and duplicate-trigger dedupe (two
identical triggers → exactly one Reactor receipt, one pressure record, one
fulfillment dispatch — surviving distinct HTTP receive timestamps via a
normalized `triggerDedupeKey`).

> **Note — the CLI cold-start policy is a fixed seed, not yet the package
> author.** `responsibility-reactor.ts` pins
> `RESPONSIBILITY_REACTOR_POLICY_REVISION = "1"` and builds the cold-start
> input itself. The package-level agentic `authorPolicyArtifactV0` is wired
> and tested in `@openprose/reactor`'s own runtime path, but the CLI's serve
> loop currently supplies a deterministic cold-start seed. Driving the CLI's
> serve loop through the agentic author is Roadmap.

### Conformance Ledger

Part I states the invariants as an unqualified north star. This ledger is
where reality is honest, audited against HEAD `52724ed`. **v0.1 is
released**: both packages are public on npm at `0.1.0` with provenance, and the
ledger reports the shipped surface rather than a release candidate.

| Invariant | State | Code-grounded current reality |
| --- | --- | --- |
| 1. Markdown is intent | **Conformant** | `*.prose.md` is the sole semantic source. The kernel never interprets source — it consumes a pinned `contract_revision` content hash (`ReceiptCoreV0.contract_revision`). No second authored surface. |
| 2. Policy is model-authored, compiled, shared | **Conformant for the package runtime; CLI seed is bounded** | `validateKernelPolicyArtifact` + `evaluateBackstops` execute model-authored, validated policy artifacts; cold start invokes `authorPolicyArtifactV0` once through the agent-SDK adapter and persists revision `1`. The tick path runs the recompile/rollback loop (`planAndMaybeExecutePolicyRecompileAfterTick`) and tests prove recompile, min-interval delay, self-trip rollback, and fail-safe missing bytes. The CLI serve adapter still supplies a deterministic cold-start seed instead of invoking the package author path; that is a host-adapter gap, not an absent runtime mechanism. |
| 3. Adapters are the only reason hosts differ | **Partial — recorded provider parity** | The SDK injects all eight adapters with no hidden defaults and fails closed on a missing slot (verified). The Cradle records two named provider/model paths producing byte-identical policy-artifact bytes with fail-closed provider drift. This is *recorded* parity, not live multi-provider support or cross-storage CI parity. |
| 4. Activations are bounded | **Conformant** | Continuity lives in durable registry + receipt state read by `tick`/`ingest`; there is no long-running model session anywhere in the runtime. |
| 5. Cost scales with surprise | **Measured v0.1 with controls** | The W7/C5 Cradle scenarios drive a real `createReactor` handle and read runtime-produced receipts. Static Reactor/no-memo/naive-loop = `46:46` / `92:0` / `92:0`; event-changing = `74:74` / `148:0` / `148:0`. No-memo and naive-loop are controls, not shipped modes. Surprise attribution is enforced per token-bearing receipt by `cost/`. Not yet proven under live multi-provider load. |
| 6. The judge fails safe | **Partial + one live K1 cassette** | Kernel fail-safe is substantially built and verified: fail-closed seed semantics, three-valued predicate outcomes, bounded-`indeterminate` → `needs-judgment`, every blocked/fail outcome a content-addressed receipt, and uncalibrated non-blocked model verdicts are rewritten to `blocked`/`needs-judgment` rather than emitting a silent confident `up`. **But `runShallowJudgeV0` throws `not-implemented-in-v0.1` for ensemble depth** — the variable-depth, diverse-ensemble, calibration-scored judge is not a runtime path. One live-recorded OpenRouter K1 cassette is accepted by the evaluator. |
| 7. Receipts are content-addressed | **Conformant for v0 + null-signer** | Receipt v0 content-addressing is real and verified (canonical SHA-256, self-verifying construction, `evidence_input_ids` content-addressed). Tiered projection ships with a passing secret-injection test. **Caveat:** the signing path is null-only by design — a non-null signature is typed but validation-rejected; `cost.provider_norm` is a deferred sub-object. |
| 8. State is replayable and exitable | **Conformant for the shipped path** | `export()` / `importReactorExitBundleV0` round-trip a runtime-produced log; an imported reactor produces the same next deterministic receipt hash. The CLI adds crash-window replay and duplicate-trigger idempotency. **Caveat:** cross-storage-adapter parity (filesystem vs. an absent Postgres) is not yet a CI gate. |

### What the tests prove — and do not

**Proven today:** `@openprose/reactor` builds, packs, imports, and passes 155
deterministic tests; the Cradle passes 121; the CLI passes 284. The receipt
schema, kernel, memoization primitive, forecast scheduler, evidence plan,
composition, projection tiers, and export/import all have real, passing
coverage. The CLI runs the package as its Reactor authority and survives the
crash-window and duplicate-trigger operational scars. The cost-scales-with-
surprise numbers are runtime-produced against synthetic worlds.

**Not yet proven:** that Reactor-class is the best architecture for target
domains; that the harness outperforms simpler baselines on real workloads;
that variable-depth ensemble judging works (it is unimplemented at v0.1);
that the recurring policy recompile loop holds under live drift; that model
families behave differently inside the harness under live inference; that
public projections and receipts are launch-grade; that responsibilities
converge over long real horizons.

### Honest current limits

- `@openprose/reactor` and `@openprose/reactor-cradle` are published at
  `0.1.0` with npm provenance. In-repo development still uses workspace links.
- The variable-depth ensemble judge is **unimplemented** — `runShallowJudgeV0`
  throws on `depth: "ensemble"`. Calibration grade is always `none` on shipped
  verdicts.
- The recurring two-timescale policy loop ships in the package runtime; the CLI
  serve adapter's cold-start path is still a deterministic seed and does not yet
  invoke the package policy author.
- Cross-adapter/replay parity is a local proof, not a required CI gate. There
  is **no Postgres adapter** in the repository.
- Cryptographic signing is unimplemented by design; the null signer is the
  only honest v0.1 state and a non-null signature is validation-rejected.
- `cost.provider_norm` is a typed but unfilled deferral (Open item I.1).
- The model matrix (Anthropic/OpenAI/Gemini/Grok) has not been run; baselines
  and ablations beyond the W7/C5 cost rows are not collected; long-horizon
  simulations are not a standard suite.
- The technical report is maintained separately in `openprose/docs`; this
  directory is the public spec anchor for the release.

> The implementation is a real, tested v0.1 substrate that justifies the
> category thesis as an architecture. The category should launch publicly
> only after the evaluation and evidence suite — variable-depth judging, the
> live model matrix, the recurring policy loop, long-horizon convergence —
> makes the claim difficult to dismiss.

### Responsibility catalog

Part I keeps one worked example (the Incident Briefing Room); these are the
others, retained as a catalog. They ship as runnable example contracts under
`skills/open-prose/examples/`.

- **Release readiness** — `Goal:` the release candidate is ready to ship;
  check before every planned release and when release evidence changes;
  criteria are tests pass, rollback exists, blockers resolved, notes current.
- **Customer risk radar** — `Goal:` renewal risks for named customers are
  surfaced before account reviews; check weekly and on support/CRM/product
  signal change; the value is a maintained risk view, not one classification.
- **Compliance evidence tracker** — `Goal:` required control evidence is
  current enough for the next audit; benefits directly from receipts and
  tiered projection (rich owner evidence, sanitized public proof).
- **Research inbox triage** — `Goal:` new research leads are classified and
  routed each workday; makes model differences visible (some classify better,
  some are cheaper for routine fulfillment).

The boundary with the Language is explicit from both sides: repository IR v0
is frozen and source-derived, while the policy artifact, token-truth receipts,
forecasts, and decisions are sibling runtime state owned by
`@openprose/reactor` — not IR fields and not `*.prose.md` syntax (see
[01-Language.md](./01-Language.md) Part II "Repository IR v0" and Part III §3).

---

## III. Roadmap — the Delta from Current to Ideal

`Ideal − Current = Roadmap`. This is the honest gap: what bridges the v0.1
substrate of Part II to the Reactor-class harness of Part I, and what must
ship before OpenProse publicly launches the term with a technical report.
Turn the Reactor-class harness from a plausible, tested architecture into a
published technical claim.

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
