---
purpose: Canonical OpenProse authoring guidance for services, systems, patterns, tests, responsibility-oriented repositories, memory, and security boundaries
related:
  - ../contract-markdown.md
  - ../forme.md
  - ../responsibility-runtime.md
  - ../prose.md
  - tenets.md
---

# Authoring Guidance

Use this file when writing or reviewing OpenProse author-facing artifacts:
`kind: service`, `kind: system`, `kind: test`, `kind: pattern`, and
`kind: responsibility`.

## Core Principles

- Prefer the smallest artifact that expresses the work: one competent service
  for one competent session, a system when composition matters, a pattern when
  repeated control flow deserves a reusable contract, a test when behavior
  needs checking, and a responsibility when an operational goal must remain
  true over time.
- Author public contracts before choreography. `### Requires`, `### Ensures`,
  `### Errors`, `### Invariants`, `### Environment`, and `### Shape` should make
  the boundary obvious to a caller and to Forme.
- Use `### Execution` only when order, loops, retries, gates, or branches are
  part of the requirement.
- Treat `workspace/` as private implementation state and `bindings/` as the
  public API. Downstream work reads declared bindings, not upstream scratch.
- Express hard boundaries as contracts, especially `Shape.prohibited`,
  environment declarations, and pattern invariants.

## Service Authoring

- A service is an atomic execution boundary: one contract, one session, one
  workspace.
- Put caller-supplied values in `### Requires`; put runtime-supplied
  configuration and secrets in `### Environment`.
- Make every `### Ensures` item named and evaluable. Include quality bars,
  completeness requirements, and degradation cases when relevant.
- Use conditional ensures for graceful degradation, such as "if no source is
  available: produce a concise caveat with the attempted search path."
- Use `### Errors` for named failures that should propagate. Do not use a
  catch-all error for ordinary alternate outcomes.
- Use `### Invariants` for properties that remain true on success and failure.
- Use `### Strategies` for judgment guidance, not hidden fallback obligations.
- Give services explicit `### Shape` when boundaries matter: `self`,
  `delegates`, and `prohibited`.

## System Authoring

- A system is a composition boundary: one public contract implemented by a
  graph of services, subsystems, and pattern instances.
- Declare the graph in `### Services`. Let Forme auto-wire by matching
  `### Requires` to `### Ensures`, and add `### Wiring` only when ambiguity
  matters.
- Keep coordinators from doing the work they coordinate. Coordinators own
  routing, conflict resolution, and synthesis responsibilities.
- For fan-out review, make reviewers independent and give synthesis explicit
  conflict-resolution duties.
- For implementation workflows, separate design, edit, review, test, and final
  synthesis roles when those outputs are independently useful.
- For large corpora, chunk semantically, analyze independently, and synthesize
  conflicts explicitly.
- Use `each` when collection completeness matters: every item must satisfy the
  postcondition.

## Pattern Authoring

A `kind: pattern` file defines reusable agent control flow. It is not run
directly. Systems instantiate patterns inside `### Services` with a structured
YAML entry:

```yaml
- name: reviewed-draft
  pattern: std/patterns/worker-critic
  with:
    worker: writer
    critic: reviewer
  config:
    max_rounds: 3
```

- Use `with:` only for slot bindings. A slot value may be a service, subsystem,
  or nested pattern instance.
- Use `config:` only for pattern parameters such as limits, thresholds, modes,
  or defaults.
- Define slots with explicit contracts: what the filled service requires, what
  it must ensure, and whether the slot is primary.
- Keep config small and operational. If a value is a domain input, it belongs in
  the system or service contract, not in pattern config.
- Put safety and correctness promises in `### Invariants`: information
  firewalls, monotonic quality ratchets, termination bounds, and required
  evidence before synthesis.
- Put slot interaction in `### Delegation` as ProseScript or clear pseudocode.
  Delegation describes the reusable control flow, not domain-specific content.
- For worker-critic loops, require the critic to emit a verdict, blocking
  issues, suggestions, and explicit exhaustion behavior when bounds are reached.
- Bound every loop or retry path with a maximum and an exhaustion output.
- Preserve information firewalls. If independent reviewers or critics must not
  see private worker reasoning, make that an invariant and enforce it through
  declared bindings.
- Do not allow bare pattern references. A pattern instance always has
  `pattern:`, `with:`, and optional `config:`.

## Test Authoring

A `kind: test` file supplies fixtures, runs a subject service or system, and
evaluates semantic assertions against the subject's public outputs.

```markdown
---
name: test-summarizer
kind: test
subject: summarizer
---

### Fixtures

- `topic`: recent developments in quantum error correction

### Expects

- `summary`: covers at least three concrete developments
- `summary`: includes uncertainty or caveats where evidence is thin

### Expects Not

- `summary`: invents citations or named sources
```

- `subject:` names a service or system, not a pattern. Prefer path-like subjects
  for cross-directory tests; bare subjects may resolve by frontmatter `name:`
  within the local test/source package.
- `### Fixtures` are caller inputs supplied by the test. Tests must not prompt
  the user for missing inputs.
- `### Expects` and `### Expects Not` are semantic assertions over
  `bindings/`. Test observable behavior, not exact phrasing.
- Prefer assertions tied to contract obligations: required output existence,
  coverage, evidence, degradation behavior, error signaling, and absence of
  forbidden behavior.
- Assertion reports should name each assertion, pass/fail status, and concise
  observed evidence for failures.

## Responsibility Authoring

A `kind: responsibility` file defines a standing goal for
Responsibility-Oriented Architecture. It is not run directly.

Use four core sections:

- `### Goal`: what must remain true
- `### Continuity`: how time qualifies the obligation
- `### Criteria`: what counts as satisfactory fulfillment
- `### Constraints`: what must remain bounded or prohibited

Use optional `### Fulfillment` only when pointing at a likely service or system
helps the compiler. Omit it when the source graph makes the relationship clear.

Keep responsibilities semantic. Do not put concrete cron syntax, webhook
routes, queues, storage schemas, or tests inside the responsibility file.
Those belong to compiled IR, harness-facing connector source, state backends,
or `kind: test` files.

## State and Memory Authoring

- Use `### Memory` only with `### Runtime` persistence (`persist: project` or
  `persist: user`).
- Declare persistent `reads:` and `writes:` explicitly. Missing reads should be
  treated as first-run state unless the service contract says otherwise.
- Values downstream work needs in the current run must also appear in
  `### Ensures`. Memory is for future invocations; bindings are for current
  callers.
- For recurring workflows, emit cursors, high-water marks, or run IDs as normal
  ensured outputs.
- For prior-run analysis, use `run` / `run[]`, record provenance, and surface
  staleness warnings.
- Use project or user memory only for state that should survive beyond the run.

## Repository Authoring

- Put durable project source under `.agents/prose/src/`, with system
  directories using `index.prose.md` and nearby private services.
- In responsibility-oriented repositories, put responsibilities near the
  systems that fulfill them unless the responsibility is deliberately
  cross-cutting.
- Co-locate services with the system that owns them. Promote a service to a
  shared location only after it has multiple real callers and a stable contract.
- Keep public names stable and domain-specific: output names like `risk-report`
  or `release-record` wire better than generic `result`.
- Commit source artifacts, examples, tests, and `.agents/prose/prose.lock`. Treat `.agents/prose/deps/`
  and `.agents/prose/runs/` as generated state. Treat `.agents/prose/agents/` as project
  memory; commit it only when the repository deliberately shares that memory.
- Give every public system at least one small `kind: test` covering the happy
  path plus one important degradation or error behavior.
- Document operational dependencies in `### Environment` and `deps.md`-style
  dependency references, not in prose hidden inside strategies.

## Security and Environment

- Put secrets and runtime configuration in `### Environment`, never in
  `### Requires`.
- Reference environment variables by name only. Do not log, echo, serialize, or
  write raw values to workspace files, bindings, manifests, reports, or memory.
- Use `Shape.prohibited` for hard safety boundaries rather than burying
  boundaries in strategies.
- Keep private scratch in `workspace/` and publish only declared outputs through
  `bindings/`.
- Avoid sending every delegate the whole manifest or full context when a smaller
  binding satisfies the contract.

## Best Practices

- When the task is one competent session, write one service; do not manufacture orchestration.
- When the outcome matters more than choreography, use Contract Markdown only.
- When exact order, bounded loops, retries, gates, or branch logic matter, use `### Execution`.
- Make every `### Ensures` an obligation: named output, evaluable quality bar, and any degradation case.
- Put caller-supplied values in `### Requires`; put runtime-provided secrets/config in `### Environment`.
- Use conditional ensures for graceful degradation: "if X unavailable: produce Y with caveats."
- Use `### Errors` for named failures that should propagate, not for ordinary alternate outcomes.
- Use `### Invariants` for properties true on success and failure, not as a cleanup checklist.
- Use `each` when collection completeness matters: every item must satisfy the postcondition.
- Give coordinators explicit `### Shape`: `self`, `delegates`, and `prohibited`.
- Treat `workspace/` as private implementation and `bindings/` as the public API.
- For fan-out review, make reviewers independent and give synthesis explicit conflict-resolution duties.
- For worker-critic loops, require verdict, blocking issues, suggestions, and bounded exhaustion behavior.
- For implementation workflows, separate design, edit, review, test, and final synthesis roles.
- For reusable patterns, promote repeated control flow into patterns with explicit slot contracts.
- For large corpora, chunk semantically, analyze independently, and synthesize conflicts explicitly.
- For recurring workflows, declare persistent memory reads/writes and emit cursors as normal ensures.
- For prior-run analysis, use `run` / `run[]`, record provenance, and surface staleness warnings.
- For tests, use fixtures plus semantic `expects` / `expects-not`; test contracts, not exact phrasing.
- For responsibilities, state the invariant and bounds; let compile infer
  triggers and fulfillment when the source graph is clear.
- For security-sensitive services, express hard boundaries as `Shape.prohibited`, not strategies.
- For model-improvable behavior, specify the desired result and leave discovery strategy open.

## Anti-Patterns

- Turning every prompt into Prose just because Prose exists.
- Writing a giant natural-language prompt inside `### Ensures`.
- Using vague outputs like "good report," "complete analysis," or "high quality result."
- Passing API keys or secrets through `### Requires`.
- Letting a coordinator also execute the work it coordinates.
- Giving every subagent the whole manifest "for context."
- Using conversation history to shuttle large artifacts instead of filesystem bindings.
- Having downstream services read upstream `workspace/` scratch files.
- Treating undeclared workspace files as public outputs.
- Returning the full artifact in the service completion message.
- Adding `### Execution` to compensate for weak contracts.
- Writing unbounded loops or "repeat until good" without a max and exhaustion path.
- Serializing independent reviewer/scanner work.
- Parallelizing work that secretly depends on shared mutable state.
- Splitting into tiny services whose outputs are not independently useful.
- Creating a mega-service with many responsibilities and no shape.
- Using the same generic output name everywhere, creating wiring ambiguity.
- Ignoring hard ambiguity warnings instead of clarifying contracts or wiring.
- Treating semantic wiring like brittle string matching.
- Hiding fallback behavior in `Strategies` instead of conditional `Ensures`.
- Declaring catch-all `error` without names, evidence, or recovery implications.
- Updating persistent memory without producing task outputs, or vice versa.
- Using project/user memory for state that should die with the run.
- Logging or echoing environment variable values.
- Letting reviewers see private worker reasoning when the pattern requires an information firewall.
- Writing tests that assert exact wording rather than observable behavior.
- Using human gates for vague approval instead of a concrete artifact decision.
- Fixing harness bugs by making every system more procedural.
- Encoding runtime machinery in responsibility files instead of preserving
  responsibilities as semantic contracts.
