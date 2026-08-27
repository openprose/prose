---
name: test-intent-designer
kind: function
version: 0.16.0
---

# Test Intent Designer

Turn the desired render into an outside-in testing intent before internal
decomposition hardens. The first test constrains the package promise, not its
implementation.

### Parameters

- `current`: current program package and prior test evidence
- `request`: current design request
- `elicitation`: resolved purpose, requirements, exclusions, and assumptions
- `topology`: proposed system and regional topology profiles
- `landscape`: existing test source, `kind: test` guidance, harnesses, and run
  evidence

### Returns

- `test_intent`: containing:
    - public subject: the package-root Contract from `index.prose.md`
    - representative fixtures derived from real intended use
    - observable desired outcomes
    - important prohibited outcomes
    - unresolved assertions that still require architect judgment
    - topology and harness behaviors that must become observable later

### Invariants

- Start with the package promise: given representative inputs, what observable
  result or maintained truth proves that the program did its job?
- Assert semantics, not exact wording or a preferred internal decomposition.
- Include `Expects Not` for the most important forms of plausible but wrong
  behavior.
- Do not invent fixtures that hide an unresolved product decision.
- Do not require every internal Contract to exist before the public test can be
  drafted.

### Strategies

- Derive the first fixture from the ordinary success scenario, then add the
  smallest fixture that distinguishes a dangerous near-miss.
- Keep architectural quality claims observable: isolation becomes prohibited
  leakage; bounded work becomes a termination or budget assertion; durable
  state becomes an assertion over the maintained projection.
- Mark the test provisional when its public promise is still provisional. A
  provisional test guides composition but does not falsely certify readiness.

---

## test-suite-projector

Refine package test intent into an ordered suite that guides implementation and
iteration without freezing internal details too early.

### Parameters

- `candidate`: proposed program architecture and Contract inventory
- `test_intent`: outside-in public test intent
- `current`: existing package tests and prior run evidence
- `landscape`: current `kind: test` semantics and available harnesses

### Returns

- `test_strategy`: an ordered ladder containing:
    1. **Package promise** — root `index.prose.md` behavior under ordinary and
       distinguishing fixtures
    2. **Contract boundaries** — each stable child promise, inputs, Returns or
       maintained truth, invariants, and prohibited context or authority
    3. **Interaction topology** — fan-out/fan-in, ordering, subscription,
       settlement, and state-ownership behavior visible through the root
    4. **Failure and recovery** — child failure, partial results, timeout,
       retries, budget exhaustion, resume, and side-effect safety where relevant
    5. **Harness portability** — the same semantic test corpus under each
       supported harness adapter, without provider-specific assertions
    6. **Performance and cost** — tracked only after semantic behavior has a
       stable baseline
- `test_sources`: complete or provisional `kind: test` files using `subject`,
  `### Fixtures`, `### Expects`, and `### Expects Not`
- `readiness`: first failing or missing rung, evidence, and the smallest next
  change that can advance it

### Invariants

- Iterate in ladder order. A later performance improvement never outranks a
  failing public promise or unsafe failure path.
- Package tests target the root Contract. Contract tests target a child only
  after its boundary is stable enough to be meaningful.
- Prefer the smallest test that rules out the largest incorrect region of the
  design space.
- A test failure is evidence about the program first. Classify framework
  pressure separately and publish it through the feedback obligation.
- Do not encode topology as an implementation snapshot when the same promise
  can be tested through observable behavior.
- Do not claim cross-harness portability until the same test sources have run
  through each selected adapter.

### Strategies

- Preserve useful failing tests. They are unresolved constraints, not clutter.
- After each material architecture change, run the earliest affected rung
  before widening the test scope.
- When a test is flaky, separate ambiguity in the assertion from model
  variability and harness nondeterminism before weakening it.
- Use semantic assertions for agent outputs and deterministic checks for file
  shape, schemas, bounds, receipts, and side-effect limits.
- Track performance and cost over comparable passing runs; never trade away a
  semantic assertion merely to improve the metric.
