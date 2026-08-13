---
role: design-reasoning
summary: |
  The load-bearing design principles behind the Prose / Forme architecture.
  These are not preferences — they are the reasoning that produced the specs. Read this
  file when making architectural decisions to ensure consistency with past reasoning.
see-also:
  - ../contract-markdown.md: Contract Markdown authoring surface
  - ../forme.md: Forme as a compile-phase render producing the topology world-model
  - ../responsibility-runtime.md: Responsibility Runtime doctrine (compile/run split)
  - ../concepts/reactor.md: The fingerprint-comparison reconciler
  - ../prose.md: Bounded render execution semantics
  - ../prosescript.md: ProseScript imperative layer
  - ../primitives/session.md: The render's harness contract
  - authoring.md: Canonical authoring guidance
---

# Design Tenets

These are the principles behind the Contract Markdown / Forme / reactor architecture. The specs say *what*. This document says *why* and *how we got there*. Future decisions should be checked against these tenets.

The system cleaves into two layers and two phases. **Two layers:** the language layer (the SKILL — the contract format and the render's intra-node body) and the harness layer (the SDK — Forme, the world-model store, the reconciler, the receipt ledger). **Two phases:** compile (intelligent, fires on contract-set change) and run (dumb, the reconciler comparing fingerprints on every wake). There is no judge in the wake or commit decision; the skip decision *is* the reconciler comparing fingerprints.

---

## 1. The container-vs-framework split is the load-bearing cleavage

The Java/Spring analogy actively drove every major decision, and it is **more** load-bearing now, not less. The *container vs. framework* distinction is the whole architecture: the **framework** (the SDK — Forme, the world-model store, the reconciler, the ledger) is the harness that wires and schedules; the **language** (the SKILL — the contract format and the render body) is what runs inside it. Auto-wiring is the default; the topology world-model is the resolved `applicationContext`; a render that runs standalone with no container is a `new Service()` — language sovereignty. Forme matches `Requires ↔ Maintains` the way Spring matches a bean by type, but **semantically** (it reads the prose), so it needs no `@Qualifier`.

The crucial sharpening: the container does its intelligent wiring **once, at compile time**, and freezes it into a deterministic artifact the run phase executes. Spring's container also resolves wiring ahead of the hot path; ours resolves it ahead of *every wake*. The render inside the container is the only place intelligence lives at run time, and even there it never decides "did this change."

The system is **harness+model agnostic**. The interpreter specs run on any Prose Complete system — Codex, Claude Code, OpenCode, Press, or any other harness that provides subagent spawning and filesystem access. The specs do not depend on any specific runtime.

**How to apply:** When facing a design decision, ask "what would the container do, and what does the bean do?" Keep intelligence in the container's compile phase and in the render; keep the run-phase reconciler dumb. If a feature blurs the container/language boundary, that's a signal to investigate why.

---

## 2. Forme is intelligent at compile, the reconciler is dumb at run

"Trust the model" is a deliberate bet — but place it precisely. Intelligence belongs in the **compile phase** (Forme's semantic wiring, the canonicalizer compiler, the postcondition compiler) and in the **render** itself. The **run phase is dumb on purpose**: the reconciler compares fingerprints — a cheap, deterministic, total comparison — and never asks an LLM "did this change."

Where Spring needs `@Qualifier` to disambiguate, Forme reads the prose and understands which facet belongs to which subscription. That is intelligence resolving ambiguity once, frozen into the topology world-model. After that, scheduling and propagation are mechanical edge-walks.

**How to apply:** Do not add deterministic fallbacks or type systems to replace model judgment *at compile time* — if the model wires wrong, improve the contracts, don't add annotations. And do not add *intelligence* to the run phase — if you find yourself wanting an LLM to judge a wake or a commit, you are reintroducing the retired judge beat. Push the intelligence back into compile, and let the run phase compare fingerprints.

---

## 3. The hybrid emerged from resisting a clean break

The original blueprint proposed a clean break from ProseScript. That was wrong. Contract Markdown enriches ProseScript; it does not replace it. The imperative layer survives because it is *useful*, not because we couldn't figure out the declarative equivalent. We *did* figure out the declarative equivalents — `for each` → `each` in `### Maintains`, `try/catch` → `### Errors` + conditional `### Maintains`, `if/elif/else` → `### Strategies`, `parallel:` → contracts + Forme wiring — and then chose to keep both.

**How to apply:** Keep ProseScript available inside `### Execution` and pattern `### Delegation` blocks. The declarative layer is the *default*; the imperative layer is the *option*. Both must always work.

---

## 4. Obligation vocabulary, split by node-vs-call: `Maintains` and `Returns`

Words are chosen for how *the model* reads them, and the split that matters now is **standing obligation vs. one-shot output**. A `responsibility` (a mounted node) declares `### Maintains`: a model reading "maintains the set of known-exploitable CVEs" treats it as a truth it must keep true *over time*, and the section also doubles as the world-model **schema** (type + canonicalization spec + facets + postconditions). A `function` (a called helper) declares `### Returns`: a model reading "returns the parsed advisories" treats it as the output shape of a single call — no world-model, no standing obligation.

This is the split the old single `### Ensures` collapsed. `### Maintains` is *not* a rename of `### Ensures` — it is a richer section doing four jobs, and the folded-in `### Criteria` postconditions live there (no separate judge beat). Reading "Ensures → Maintains" as a pure rename is the false-friend trap.

**How to apply:** A standing truth maintained over time is `### Maintains` on a `responsibility`. A one-shot computed output is `### Returns` on a `function`. Prefer words the model interprets as obligations for the former, and as plain output shape for the latter. Do not put a world-model on a `function`.

---

## 5. No shared *scratch* — but a shared *canonical world-model* is correct

ProseScript's filesystem model was already correct SOA. The original blueprint's shared mutable sandbox variables (`&Findings`) went backward — shared mutable *scratch* that breaks isolation between agents. That instinct was right, and it still holds: a render's **workspace** is private, never fingerprinted, and never subscribed to.

But the sharpening matters: a render's **published world-model is shared** — and that is *correct*, not a regression. The whole architecture is built on subscription to a shared, canonical, content-addressed maintained truth. The discipline is not "nothing is shared"; it is the **published / workspace split**: workspace scratch is private and immaterial; the published world-model is the canonical artifact, fingerprinted on commit, read by downstreams **by reference** at a pinned snapshot. A downstream never mutates an upstream's truth — it reads it and maintains its own. Communication is producer-publishes-truth → subscriber-reads-by-reference, never write-into-a-shared-global.

**How to apply:** Never introduce shared mutable *scratch* between renders. Do not be afraid of the shared *canonical world-model* — it is the point. If a feature wants two nodes to write the same truth, that is a wiring error: one node maintains it, the other subscribes. Reads are by-reference and snapshot-pinned, so concurrent commits never tear a read.

---

## 6. Two levels of author control: declarative contracts, imperative render body

The level stack collapsed from three to **two**. The old third level — author-written intra-`system` `### Wiring` between the contracts and the `### Execution` block — is gone with the `system` kind. What remains:

- **Declarative (the default):** write `### Requires` / `### Maintains` contracts and let Forme draw the DAG. The topology world-model is the materialized output of the contracts — you can inspect it, but you do not author it; it is regenerated on every contract-set change.
- **Imperative (the option):** write the render body in `### Execution` (ProseScript `call`, `session`/`agent`/`resume`, control flow) to pin *intra-node* behavior.

The principle survives — an explicit level should look like what the automatic level would produce, and pinning is optional — but cross-node wiring is **no longer an author-pinnable level**. There is no `### Wiring` to hand-write; composition across nodes is *only* subscription, and composition inside a node is *only* the imperative render body.

**How to apply:** Author contracts and let Forme wire. Drop to `### Execution` only to pin intra-node behavior. Do not reintroduce a hand-authored cross-node wiring level — if you want to control who feeds whom, control it through `### Requires` / `### Maintains` facets, which is what Forme matches.

---

## 7. There is no `system` kind — the render atom is the only runnable unit

The old taxonomy cleaved the world into *atomic service / internal-graph system / un-runnable standing goal*. That was right for the retired judge→fulfill→reflect model and wrong for a data-flow DAG. The `system` kind is **deleted**: composition is never a third "internally-autowired graph" kind. The runnable unit is the **render atom** (a declaration plus its render), and it appears as:

- **`responsibility`** — a mounted node: a standing truth maintained over time (`### Requires` → `### Maintains`), woken by the reconciler. The headline kind.
- **`function`** — a called helper: a one-shot `### Parameters` → `### Returns`, stateless, invoked via ProseScript `call`. The library tier.
- **`gateway`** — sugar for an external-driven `responsibility` (ingress).

Composition is now exactly two things: **intra-node** imperative `call`/`session` inside a render body, and **cross-node** subscription. Tests remain tooling executed by `prose test`. Patterns remain reusable coordination, instantiated at compile and expanded into nodes — they are not directly runnable.

**How to apply:** A standing truth maintained over time is a `responsibility`. A one-shot computed helper is a `function`. Ingress is a `gateway`. Do not reach for a "system" to hold a graph of work — a graph of work is a set of subscribed `responsibility` nodes that Forme wires, plus `function`s the renders `call`.

---

## 8. "finally" is imperative, "invariants" is declarative

`finally` implies temporal ordering — "run this code last." `### Invariants` is the correct declarative section: properties that hold unconditionally, with no sequencing implied. The model reads `### Invariants` as "this must be true regardless of what happens" — which is stronger and more precise than "run this after everything else."

**How to apply:** When designing new contract sections, avoid words that imply temporal ordering. Prefer words that describe properties of the world.

---

## 9. Error handling needed a third channel

Errors are distinct from degraded success. The initial proposal folded everything into one output channel. That was wrong — a render that signals "I cannot maintain this at all" (and commits nothing — a `failed` receipt, prior truth stands) is fundamentally different from a render that says "I maintained it, but with caveats" (a `rendered` receipt with a degraded-but-true world-model). This led to three channels:

- `### Maintains` — the world-model the render commits on success (including conditional/degraded variants), with its postconditions
- `### Errors` — what the render signals when it genuinely cannot commit anything
- `### Invariants` — what is true regardless of outcome

**How to apply:** Do not collapse these. A conditional `### Maintains` clause is recovery (still `rendered`). An `### Errors` entry is a failed render (nothing commits). They drive different reconciler outcomes — only a moved fingerprint on a `rendered` receipt propagates.

---

## 10. on-error collapsed because it implies a caller that doesn't exist declaratively

The initial design had `on-error:` as a caller-side block for handling dependency failures. But in the purely declarative model (no execution block), there is no explicit call site to attach error handling to. Recovery is the reconciler's job, expressed as alternative acceptable truths in conditional `### Maintains` clauses.

**How to apply:** Error recovery should be expressed as what world-model the render can still maintain, not as a procedure to follow when something fails.

---

## 11. The interpreter spec pattern is the foundational insight

`forme.md` and `prose.md` are the same mechanism: a markdown file that, when loaded into an LLM's context, causes it to behave as a specific kind of machine. This is how OpenProse has always worked — the original ProseScript `prose.md` made the LLM behave as a VM. The two-phase model just applies the same pattern twice: first as a DI container, then as an execution engine.

**How to apply:** New system capabilities should be expressed as interpreter specs (markdown files that change the agent's behavior when loaded), not as code. The spec IS the implementation.

---

## 12. Forme was hiding in the standard library

The original blueprint lumped patterns, controls, roles, backpressure, and auto-wiring into "the standard library." But a standard library is a set of utilities. What we had was an opinionated framework with its own execution model (read contracts → semantically match `Requires ↔ Maintains` → emit the topology world-model). Naming it Forme and separating it into the harness layer was the key architectural move.

**How to apply:** When something in the "standard library" has opinions about how systems should be structured, it belongs in Forme, not in the language or the runtime.

---

## 13. The workspace / published-world-model split came from "what is material?"

A single output area was overloaded — it mixed intermediate scratch with the truth others subscribe to. The separation is now sharper and load-bearing for fingerprinting: a render's **workspace** is private scratch (everything it writes while working, **never fingerprinted, never subscribed to**) vs. the **published world-model** (the canonical content-addressed artifact, **fingerprinted on commit**, read by downstreams by reference). Committing the world-model is the publish step; the compiled canonicalizer computes the fingerprints over the store's deterministic serialization.

**How to apply:** A render writes scratch to its workspace and the structured truth to its world-model. It does not gratuitously rewrite settled facts (that would move fingerprints that should not move). It renders human-facing prose *from* the structured truth, never *as* the subscribed truth — free-form prose is a derived projection excluded from the fingerprint. The harness handles the commit-and-fingerprint; the render focuses on its contract.

---

## 14. The "bitter lesson": intelligence at compile, determinism at run

Every decision is evaluated against: "does this system get better as models improve?" Imperative constructs cap improvement — `loop 5 times` always loops 5 times. Declarative ones enable it — `maintain 3+ corroborating sources` lets a better model get there in one pass. Keeping both is the compromise; authors choose where on the spectrum to sit.

The architecture-level form of the bitter lesson is the **compile/run split**: intelligence decides *what counts as a change* once, at compile time (the canonicalizer compiled from `### Maintains`), and a smarter model makes that compile step better; determinism checks it every time, at run time (the reconciler comparing fingerprints), and never needs to improve. Where React's deps array is an intelligent decision made ahead of time and `Object.is` is the dumb check, here the canonicalizer is the intelligent decision and the fingerprint comparison is the dumb check. Putting an LLM in the wake decision would *cap* the system on the model's per-wake judgment and burn the surprise budget — exactly the regression the bitter lesson warns against.

**How to apply:** When adding a construct, check: would a smarter model execute this differently? If yes, it is declarative (a contract) and the intelligence belongs at compile or render time. If no (explicit data flow, the wake comparison), it is deterministic and belongs in the run phase. Never move a per-wake decision into the model.

---

## 15. Strategies are more general than they look

Strategies absorbed three separate imperative constructs: `if/elif/else` (conditional branching), `choice` (selecting among options), and multi-perspective evaluation. This wasn't planned — it emerged from asking "is perspectives a separate construct?" and realizing it was just a strategy: "evaluate from standpoint X, then from Y, then synthesize."

**How to apply:** Before adding a new construct, check whether it's a strategy with a `when` clause. It probably is.

---

## 16. Nodes don't discover each other — Forme wires them from the declarations

Forme discovers the graph. This is dependency injection, not service discovery, and the injection target is **intent declared in the contract**: a node declares what it `### Requires` (facet-level needs) and what it `### Maintains` (its world-model schema, including the facets it exposes). It does not know who produces its inputs or who consumes its outputs. Forme matches `Requires.<facet> ↔ Maintains.<facet>` semantically and records the resolved edges in the **topology world-model**. At run time the render reads its inputs **by reference** at the location the harness hands it; it never names an upstream.

**How to apply:** Nodes should never reference other nodes by name in their contracts. They declare facet contracts. The wiring (who maintains what) lives in the topology world-model Forme produces, not in the node. If you find yourself wanting to name a producer, declare the facet you need instead and let Forme match it.

---

## 17. Interface and contract collapse because the runtime is an LLM

In a traditional language, `accepts: { topic: string }` (type signature) and `requires: topic is a non-empty string` (constraint) are different things — the type system enforces one, the contract system enforces the other. In a language where the runtime reads prose, this distinction is unnecessary. The model doesn't need both. `### Requires` is the interface AND the constraint; `### Maintains` is the world-model **type** AND its canonicalization spec AND its postconditions, all at once.

**How to apply:** Do not reintroduce type/constraint separation. Express the shape of data in the `### Requires` / `### Maintains` / `### Returns` description. If you need a quick-glance catalog view, extract it from the descriptions — do not add a parallel rigid field.

---

## 18. Responsibility-Oriented Architecture adds standing goals, not another framework

Responsibilities, Reactor, and Forme compose into one runtime stack.
Responsibilities define what world-model must remain true over time (`### Requires`
→ `### Maintains`). Reactor reconciles those truths by **comparing fingerprints**
across three wake sources — no judge, no status enum, no pressure record, no
separate fulfillment activation. Gateways define how time or the outside world
enters (sugar for an external-driven responsibility). Forme wires the DAG of
responsibilities that maintain each other's inputs.

OpenProse enables this architecture, but not every OpenProse program is
responsibility-oriented — many are one-shot `function` calls or standalone
renders.

**How to apply:** Do not create pluggable framework modes for Responsibilities,
Reactor, and Forme. Treat them as adjacent semantic layers available through
the same OpenProse skill. Do not reintroduce a judge / verdict / pressure loop —
the reconciler's fingerprint comparison *is* the maintenance loop.

---

## 19. Compile is the only intelligent phase before serving

Serving is deterministic: load the compiled IR, register triggers, receive
events, run the reconciler, and launch bounded renders. The intelligent work —
reading semantic Markdown, resolving Forme wiring into the topology world-model,
compiling the natural-language canonicalization spec into a deterministic
canonicalizer, and compiling `### Maintains` postconditions into validators —
belongs in `prose compile` and in the bounded renders themselves. Each compile
step is itself a render, so the compile output is auditable. Intelligence is
frozen into deterministic artifacts once, and re-fires only on contract change —
the rarest event.

**How to apply:** Keep harness primitives small and the run-phase reconciler
dumb. Push semantic interpretation into Markdown docs and compile-step renders,
then validate the compiled IR (topology + canonicalizers + validators) before
serving it. If a serve-time decision wants intelligence, it belongs at compile.

---

## 20. A responsibility is not a cron

A responsibility defines a standing truth and how it wakes. It does not exist to
declare schedules, webhooks, queues, storage, or step-by-step behavior. Those are
compiled or harness-facing mechanisms inferred from the responsibility and the
source graph unless explicit connector detail is necessary (a `gateway`).

`### Continuity` is the structural **wake-source** declaration (input-driven /
self-driven / external-driven) — *not* a narrative recurrence policy. A
self-driven cadence is not a cron the author writes; it is the policy that lets a
lapsing `valid_until` move a fingerprint and propagate as surprise. The freshness
*state* lives in the world-model; `### Continuity` is the *policy*.

**How to apply:** If a responsibility file starts reading like runtime machinery,
move that machinery out. The core sections are `### Goal`, `### Requires`,
`### Maintains` (which absorbs the old `### Criteria` as postconditions), and
`### Continuity`. Do not add a `### Memory` ledger — the single world-model per
node subsumes it.
