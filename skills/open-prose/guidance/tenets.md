---
role: design-reasoning
summary: |
  The load-bearing design principles behind the Prose / Forme architecture.
  These are not preferences — they are the reasoning that produced the specs. Read this
  file when making architectural decisions to ensure consistency with past reasoning.
see-also:
  - ../contract-markdown.md: Contract Markdown authoring surface
  - ../forme.md: Forme container spec
  - ../prose.md: Prose VM spec
  - ../prosescript.md: ProseScript imperative layer
  - patterns.md: Proven execution patterns
  - antipatterns.md: Common mistakes to avoid
---

# Design Tenets

These are the principles behind the Contract Markdown / Forme / Prose VM architecture. The specs say *what*. This document says *why* and *how we got there*. Future decisions should be checked against these tenets.

---

## 1. The Spring analogy is load-bearing, not decorative

The Java/Spring analogy actively drove every major decision: separating the framework (Forme) from the language (Prose), auto-wiring as the default, the manifest as `applicationContext.xml`, three levels of control mapping to `@Autowired` / XML config / `new Service()`. This is not a naming convenience — it is the architectural framework.

The system is **harness+model agnostic**. Prose and Forme are interpreter specs that run on any Prose Complete system — Codex, Claude Code, OpenCode, Press, or any other harness that provides subagent spawning and filesystem access. The specs do not depend on any specific runtime.

**How to apply:** When facing a design decision, ask "what would Spring do here?" If the answer diverges from our design, that's a signal to investigate why.

---

## 2. "Trust the model" is a deliberate bet

The container is intelligent, not deterministic. Ambiguity in wiring is resolved by understanding, not type matching. This was an explicit choice. Where Spring needs `@Qualifier` to disambiguate, Forme reads the prose and understands which `findings` belongs to which service.

**How to apply:** Do not add deterministic fallbacks or type systems to replace model judgment. If the model gets wiring wrong, improve the contracts, don't add annotations.

---

## 3. The hybrid emerged from resisting a clean break

The original blueprint proposed a clean break from `.prose`. That was wrong. Contract Markdown enriches ProseScript; it does not replace it. The imperative layer survives because it is *useful*, not because we couldn't figure out the declarative equivalent. We *did* figure out the declarative equivalents — `for each` → `each` in `### Ensures`, `try/catch` → `### Errors` + conditional `### Ensures`, `if/elif/else` → `### Strategies`, `parallel:` → contracts + Forme composites — and then chose to keep both.

**How to apply:** Never remove ProseScript from `.prose` files or `### Execution` blocks. The declarative layer is the *default*; the imperative layer is the *option*. Both must always work.

---

## 4. "Ensures" was chosen for the VM, not the human

The word `Ensures` was picked because it carries obligation when *the model* reads it. `Returns` is descriptive — a model reading "returns findings" treats it as a description of output shape. `Ensures` is a commitment — a model reading "ensures findings from 3+ sources" treats it as something it must make true. The language optimizes for model comprehension over human developer experience.

**How to apply:** When choosing vocabulary for new language constructs, prefer words the model interprets as obligations over words that are familiar to human programmers.

---

## 5. &-State was a regression, not a feature

ProseScript's filesystem model was already correct SOA. The original blueprint's shared mutable sandbox variables (`&Findings`) went backward — shared mutable globals that break isolation between agents. The instinct "services call services, not write to globals" was right from the start.

**How to apply:** Never introduce shared mutable state between services. Communication is always through the filesystem: workspace (private) → bindings (public) → downstream inputs. If a proposed feature requires shared state, redesign it as service-to-service communication.

---

## 6. Each level of control is the materialized output of the level above

Contracts → auto-wired graph → wiring declaration → execution sequence. You can write any level to pin it. You omit it to let the intelligent layer above generate it. This is the single unifying principle of the three levels of author control.

**How to apply:** If a new feature adds a level of control, it must fit this stack. The explicit version should look like what the automatic version would produce. Pinning should always be optional.

---

## 7. Two things, not three

There are exactly two concepts: the Component (a service with a contract) and the Container (the intelligent orchestrator). There is no architectural distinction between a leaf and a coordinator — a component that delegates is just a component whose shape mentions other components. The container treats them uniformly.

**How to apply:** Do not introduce new component types. If something feels like a new kind of thing, check whether it's actually a component with a specific shape pattern. It almost certainly is.

---

## 8. "finally" is imperative, "invariants" is declarative

`finally` implies temporal ordering — "run this code last." `### Invariants` is the correct declarative section: properties that hold unconditionally, with no sequencing implied. The model reads `### Invariants` as "this must be true regardless of what happens" — which is stronger and more precise than "run this after everything else."

**How to apply:** When designing new contract sections, avoid words that imply temporal ordering. Prefer words that describe properties of the world.

---

## 9. Error handling needed a third channel

Errors are distinct from degraded success. The initial proposal folded everything into `ensures`. That was wrong — a service that signals "I cannot do this at all" is fundamentally different from a service that says "I did it, but with caveats." This led to three channels:

- `### Ensures` — what the service produces on success (including conditional/degraded variants)
- `### Errors` — what the service signals when it genuinely cannot produce anything
- `### Invariants` — what is true regardless of outcome

**How to apply:** Do not collapse these. A conditional `### Ensures` clause is recovery. An `### Errors` entry is failure. They serve different purposes for the orchestrator.

---

## 10. on-error collapsed because it implies a caller that doesn't exist declaratively

The initial design had `on-error:` as a caller-side block for handling dependency failures. But in the purely declarative model (no execution block), there is no explicit call site to attach error handling to. Recovery is the orchestrator's job, expressed as alternative acceptable outputs in conditional `ensures` clauses.

**How to apply:** Error recovery should be expressed as what the program can still produce, not as a procedure to follow when something fails.

---

## 11. The interpreter spec pattern is the foundational insight

`forme.md` and `prose.md` are the same mechanism: a markdown file that, when loaded into an LLM's context, causes it to behave as a specific kind of machine. This is how OpenProse has always worked — the original ProseScript `prose.md` made the LLM behave as a VM. The two-phase model just applies the same pattern twice: first as a DI container, then as an execution engine.

**How to apply:** New system capabilities should be expressed as interpreter specs (markdown files that change the agent's behavior when loaded), not as code. The spec IS the implementation.

---

## 12. Forme was hiding in the standard library

The original blueprint lumped composites, controls, roles, backpressure, and auto-wiring into "the standard library." But a standard library is a set of utilities. What we had was an opinionated framework with its own execution model (read contracts → build graph → produce manifest). Naming it Forme and separating it was the key architectural move.

**How to apply:** When something in the "standard library" has opinions about how programs should be structured, it belongs in Forme, not in the language or the runtime.

---

## 13. The workspace/bindings split came from "what about private state?"

A single binding file per service was overloaded — it mixed intermediate scratch work with public outputs. The question "what about private variables?" led to the separation: workspace (private, everything the service writes) vs bindings (public, only declared `ensures` outputs). The copy-on-return mechanism is the publish step.

**How to apply:** Services should never be aware of `bindings/`. They write to their workspace. The VM handles publishing. This keeps services focused on their contract, not on the plumbing.

---

## 14. The "bitter lesson" is the design constraint

Every decision is evaluated against: "does this program get better as models improve?" Imperative constructs cap improvement — `loop 5 times` always loops 5 times. Declarative ones enable it — `ensure 3+ sources` lets a better model get there in one pass. Keeping both is the compromise. Authors choose where on the spectrum to sit.

**How to apply:** When adding a new construct, check: would a smarter model execute this differently? If yes, the construct should be declarative (a contract). If no (e.g., explicit data flow), it can be imperative.

---

## 15. Strategies are more general than they look

Strategies absorbed three separate imperative constructs: `if/elif/else` (conditional branching), `choice` (selecting among options), and multi-perspective evaluation. This wasn't planned — it emerged from asking "is perspectives a separate construct?" and realizing it was just a strategy: "evaluate from standpoint X, then from Y, then synthesize."

**How to apply:** Before adding a new construct, check whether it's a strategy with a `when` clause. It probably is.

---

## 16. Components don't discover each other

Forme discovers them. This is dependency injection, not service discovery. A service declares what it requires and what it ensures. It does not know who provides its inputs or who consumes its outputs. The container handles that.

**How to apply:** Services should never reference other services by name in their contracts. They reference data shapes. The wiring (who provides what) lives in the manifest, not the component.

---

## 17. Requires/Ensures collapsed accepts/returns because the runtime is an LLM

In a traditional language, `accepts: { topic: string }` (type signature) and `requires: topic is a non-empty string` (constraint) are different things — the type system enforces one, the contract system enforces the other. In a language where the runtime reads prose, this distinction is unnecessary. The model doesn't need both. `### Requires` is the interface AND the contract.

**How to apply:** Do not reintroduce type/constraint separation. If you need to express the shape of data, do it in the `### Requires` / `### Ensures` description. If you need a quick-glance catalog view, extract it from the descriptions.
