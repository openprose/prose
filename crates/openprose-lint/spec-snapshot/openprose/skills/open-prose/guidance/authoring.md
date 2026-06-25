---
purpose: Canonical OpenProse authoring guidance for responsibilities, functions, gateways, patterns, tests, the maintained world-model, and security boundaries
related:
  - ../contract-markdown.md
  - ../forme.md
  - ../responsibility-runtime.md
  - ../prose.md
  - tenets.md
---

# Authoring Guidance

Use this file when writing or reviewing OpenProse author-facing artifacts:
`kind: responsibility`, `kind: function`, `kind: gateway`, `kind: test`, and
`kind: pattern`.

Every authored file is **one render** — a contract plus the bounded session that
runs it. The `kind` field is sugar over that single render atom: each kind is the
same render with different or missing sections (`plan.md` §1). There is **no
`kind: system`** and **no `kind: service`**: composition is imperative `call`
*inside* a render or a cross-node *subscription* across responsibilities, never a
third internally-autowired graph kind (`plan.md` §3).

## Core Principles

- Prefer the smallest artifact that expresses the work: a responsibility when an
  operational truth must remain current over time, a function when one called
  helper does one job, a pattern when repeated control flow deserves a reusable
  contract, a gateway when time or the outside world enters the graph, and a test
  when behavior needs checking.
- Author public contracts before choreography. `### Requires` / `### Maintains`
  (data-flow), `### Parameters` / `### Returns` (callable), plus `### Errors`,
  `### Invariants`, `### Environment`, and `### Shape` should make the boundary
  obvious to a caller and to Forme.
- Use `### Execution` only when order, loops, retries, gates, or branches are
  part of the requirement. It is the intra-node render body, and none of it is a
  node (`plan.md` §7).
- Treat the render's private `workspace/` as scratch that is never fingerprinted,
  and the canonical published world-model as the subscribable truth. Downstream
  work reads the published world-model, never upstream scratch.
- Express hard boundaries as contracts, especially `Shape.prohibited`,
  environment declarations, and pattern invariants.

## Responsibility Authoring

A `kind: responsibility` file defines a mounted DAG node: a standing truth kept
current over time. It declares **both halves of its interface** — `### Requires`
(its subscription contracts) and `### Maintains` (the shape of the truth it
keeps) — plus its wake-source in `### Continuity`. It is a node because it is
mounted as a subscribable producer, **not** because it holds state (`plan.md`
§2).

- Put facet-level needs in `### Requires`. Each entry names a facet contract that
  Forme matches semantically to some producer's `### Maintains` facet
  (`Requires.<facet> ↔ Maintains.<facet>`). `### Requires` is the *need*; the
  resolved producer is Forme's choice.
- Make `### Maintains` do its four jobs (`world-model.md` §2): a **type** (the
  fields, including freshness fields like `valid_until` / `last_corroborated`); a
  **canonicalization spec** (what equality means — which fields are material and
  which are volatile-but-immaterial, such as `fetched_at` timestamps and request
  ids); optional **facets** (named, independently-subscribable parts of the
  truth); and **postconditions** (validators the render must leave the truth
  satisfying before it signs).
- Spend real care on the canonicalization spec. It is the highest-leverage
  memoization control: without it a feed re-polled every few minutes always
  *looks* changed and "cost scales with surprise" degrades into "cost scales with
  the clock." Name material content; exclude timestamps, request ids, and
  cosmetic ordering.
- Honor the structured-backing rule: anything subscribed must have a structured,
  canonicalizable backing. Fingerprint the structured truth and render prose
  *from* it; free-form rendered prose is a derived projection excluded from the
  fingerprint (`world-model.md` §3).
- Declare freshness *state* (`valid_until`, `last_corroborated`, `confidence`) in
  `### Maintains` and freshness *policy* (the recheck cadence) in
  `### Continuity`. A lapsing `valid_until` flips a fact's status, moves that
  facet's fingerprint, and propagates as ordinary surprise (`world-model.md` §6).
- State postconditions as conditions on the output (the folded-in `### Criteria`),
  not a separate judge beat. Deterministically-expressible postconditions are
  verified by the harness on commit; irreducibly-semantic ones are self-attested
  by the render.
- Keep responsibilities semantic. Do not put concrete cron syntax, webhook
  routes, queues, or storage schemas inside the responsibility file. Those belong
  to compiled intent, optional `kind: gateway` source, or state backends.

## Function Authoring

A `kind: function` is a called render: stateless, ephemeral, and the replacement
for the retired `service`. Its interface is `### Parameters` → `### Returns`, a
plain call interface: arguments in, a value out. A function carries no
world-model, no `### Maintains`, and no `### Continuity`.

- Put caller-supplied values in `### Parameters`; put runtime-supplied
  configuration and secrets in `### Environment`.
- Make every `### Returns` item named and evaluable. Include quality bars,
  completeness requirements, and degradation cases when relevant.
- Use conditional returns for graceful degradation, such as "if no source is
  available: produce a concise caveat with the attempted search path."
- Use `### Errors` for named failures that should propagate. Do not use a
  catch-all error for ordinary alternate outcomes.
- Use `### Invariants` for properties that remain true on success and failure.
- Use `### Strategies` for judgment guidance, not hidden fallback obligations.
- Give functions explicit `### Shape` when boundaries matter: `self`,
  `delegates`, and `prohibited`. `delegates` names the helper functions this
  render `call`s (intra-node, ephemeral) — it is not a DAG edge.
- Author functions rarely and call them constantly; most ship pre-built in
  `std/`. They are the standard-library tier.

## Composition Authoring

Composition is no longer a separate kind. There are exactly two forms:

- **Intra-node `call`** — inside one render's `### Execution`, ProseScript `call`s
  functions and spawns `session` / `agent` sub-agents. This is sequential,
  imperative work that produces *this* node's world-model; none of it is a node.
  Use it when the steps are part of one node's job (e.g. a sequential workflow
  that flattens into one responsibility).
- **Cross-node subscription** — Forme wires one responsibility's `### Requires` to
  another's `### Maintains` across the mounted DAG. Use it when independent
  truths should each be their own node and a downstream wakes on the part it cares
  about (e.g. parallel fan-in over independent producers).

Guidance for both:

- Keep coordinating renders from doing the work they coordinate. A render that
  fans out owns routing, conflict resolution, and synthesis, not the leaf work.
- For fan-out review, make reviewers independent and give synthesis explicit
  conflict-resolution duties.
- For implementation workflows, separate design, edit, review, test, and final
  synthesis into functions when those outputs are independently useful.
- For large corpora, chunk semantically, analyze independently, and synthesize
  conflicts explicitly.
- Use `each` when collection completeness matters: every item must satisfy the
  postcondition.

## Cost and Context Discipline

Applies when authoring a **multi-node Reactor pipeline**: standing
responsibilities that run continuously, fan out, or wake on a high volume of
events (a session, PR, or webhook stream). It does **not** apply to a one-shot
function or a single competent responsibility — do not tier or pre-bound those
(see "do not manufacture orchestration"). And it does not override Tenet 2: a
render whose *job* is to explore (research, a repo audit) should explore. The
rules below are for the narrow-transform renders that dominate a pipeline's
volume.

- **Tier the work; let a cheap gatekeeper filter surprise.** Do not write one
  render that re-derives every downstream truth on each event. Put a small,
  narrow **classifier** node early that turns each raw event into a few typed,
  per-domain *signals*, and give each downstream truth its own facet so it wakes
  only when its signal moves. Expensive synthesis then runs only on real change;
  unrelated domains memo-skip at zero cost. This is the `guard` pattern made
  structural (`03-ReactorPattern.md`, Rule 5). Shape: an event stream → a cheap
  classifier emitting `#decision-signal` / `#bug-signal` / … → one accumulator
  per signal → a coalesced rollup.
- **Bound each narrow render to its inline input.** A transform render (classify,
  append one entry, compose facets) should read **only** the evidence the wake
  delivered and its own prior world-model — not the repo, the filesystem, or
  sibling nodes' scratch. State this in `### Invariants` ("the only readable
  input is the staged evidence and the prior world-model; do not scan the
  filesystem or the repository") and keep the task single-purpose ("classify
  into these shapes," not "summarize everything"). `max_turns` caps *turns*, not
  context *size*: it is the unscoped task that explodes cost, because a capable
  agent will wander a large repo to satisfy an open-ended one. Scope the task and
  the inputs; exploration stays available to the renders that genuinely need it.
- **Validate the cost-shape; do not assume it.** Prove selective wake before
  trusting a pipeline: a deterministic check that the right nodes render and the
  rest skip (a `kind: test` over dispositions, or the reactor eval-harness
  deterministic tier), plus an llm-as-judge pass over the produced truths against
  their `### Maintains` postconditions for quality. Capture a committed replay so
  the check is repeatable and keyless — cheaper and more honest than re-running
  the live pipeline to eyeball it.
- **Keep renders small enough for a cheap model.** Model selection is an operator
  concern (`reactor.yml`, today one global model; per-node `### Runtime` model is
  declarable but not yet honored by the CLI — see `reactor.md`). Author each
  high-volume render narrow enough that a cheap model suffices; reserve a stronger
  model for rare, strict work such as the compile phase.

## Gateway Authoring

A `kind: gateway` file is sugar for an external-driven responsibility: it
declares ingress for the responsibility DAG. It is not run directly.

- Use gateways when a responsibility should not carry concrete ingress itself:
  stable HTTP routes, provider webhooks, explicit schedules, or provider event
  names.
- Keep gateways thin. They declare `### Continuity: external-driven`, receive time
  or external events, maintain the latest incoming truth, and emit the trigger
  that wakes a downstream responsibility; functions and responsibilities perform
  the work.
- Use `### Receives` for HTTP method/path, provider, event, and auth notes.
- Use `### Schedule` for standard five-field cron expressions.
- Use `### Emits` to name the responsibility the gateway should wake.
- Forme finds the entry-point set precisely by finding the responsibilities whose
  `### Continuity` is external-driven.
- Prefer diagnostics over invention when provider subscription setup, auth, or
  payload shape is not explicit enough to compile.

## Pattern Authoring

A `kind: pattern` file defines reusable agent control flow. It is not run
directly. Responsibilities and functions instantiate patterns with a structured
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

- Use `with:` only for slot bindings. A slot value may be a responsibility,
  function, or nested pattern instance.
- Use `config:` only for pattern parameters such as limits, thresholds, modes,
  or defaults.
- Define slots with explicit contracts: what the filled node requires, what it
  must produce, and whether the slot is primary.
- Keep config small and operational. If a value is a domain input, it belongs in
  the responsibility or function contract, not in pattern config.
- Put safety and correctness promises in `### Invariants`: information
  firewalls, monotonic quality ratchets, termination bounds, and required
  evidence before synthesis.
- Put slot interaction in `### Delegation` as ProseScript or clear pseudocode.
  Delegation describes the reusable control flow, not domain-specific content.
- For worker-critic loops, require the critic to emit a verdict, blocking
  issues, suggestions, and explicit exhaustion behavior when bounds are reached.
- Bound every loop or retry path with a maximum and an exhaustion output.
- Preserve information firewalls. If independent reviewers or critics must not
  see private worker reasoning, make that an invariant and enforce it through the
  published world-model, not shared scratch.
- Do not allow bare pattern references. A pattern instance always has
  `pattern:`, `with:`, and optional `config:`.

## Test Authoring

A `kind: test` file supplies fixtures, runs a subject responsibility or function,
and evaluates semantic assertions against the subject's world-model or returned
value.

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

### Expects Not

- `summary`: invents citations or named sources
```

- `subject:` names a responsibility or function, not a pattern. Prefer path-like
  subjects for cross-directory tests; bare subjects may resolve by frontmatter
  `name:` within the local test/source package.
- `### Fixtures` are caller inputs supplied by the test. Tests must not prompt
  the user for missing inputs.
- `### Expects` and `### Expects Not` are semantic assertions over the subject's
  world-model (responsibility) or returned value (function). Test observable
  behavior, not exact phrasing.
- Prefer assertions tied to contract obligations: required output existence,
  coverage, evidence, degradation behavior, error signaling, and absence of
  forbidden behavior.
- Assertion reports should name each assertion, pass/fail status, and concise
  observed evidence for failures.

## World-Model and Freshness Authoring

A responsibility's persisted world-model **is** its memory: one canonical truth
per node subsumes the old `### Memory` reads/writes ledger (`world-model.md`
§9.4). There is no separate `### Memory` section. A `function` is stateless and
has no world-model; a former helper that was genuinely stateful is really a
responsibility, and its persisted state is its world-model.

- Declare the durable shape — decision history, watermarks, cursors, and
  per-entity truth — in `### Maintains`, with facets so a downstream wakes only
  on the part it cares about.
- Values a downstream needs in the *current* run flow across a subscription edge
  (`Requires ↔ Maintains`); the world-model persists what must survive *beyond*
  the run. For recurring workflows, keep cursors, high-water marks, and run ids
  as material fields of the maintained truth.
- Treat the published world-model as the single canonical truth. SQL, vector, and
  dashboard views over it are derived projections, never the truth
  (`world-model.md` §1).
- The render writes the world-model and signs a receipt with its fingerprints by
  applying the compiled canonicalizer locally; this works standalone, with no
  harness present (`architecture.md` §3.2).

## Repository Authoring

- Put durable authored intent under `<openprose-root>/src/`. Co-locate the
  functions a responsibility `call`s near it; promote a function to a shared
  location only after it has multiple real callers and a stable contract.
- Keep responsibility files near the work that fulfills them unless the
  responsibility is deliberately cross-cutting.
- Keep public facet names stable and domain-specific: maintained facets like
  `risk-report` or `release-record` wire better than generic `result`.
- Commit source artifacts, examples, tests, and `<openprose-root>/prose.lock`.
  Treat `<openprose-root>/dist/`, `<openprose-root>/deps/`, and
  `<openprose-root>/runs/` as generated artifacts unless the host asks for a
  served compiled-intent handoff. Treat the persisted world-model under
  `<openprose-root>/state/` as durable cross-run truth; commit it only when the
  repository deliberately shares that state.
- Give every public responsibility at least one small `kind: test` covering the
  happy path plus one important degradation or error behavior.
- Document operational dependencies in `### Environment` and `deps.md`-style
  dependency references, not in prose hidden inside strategies.

## Security and Environment

- Put secrets and runtime configuration in `### Environment`, never in
  `### Requires` or `### Parameters`.
- Reference environment variables by name only. Do not log, echo, serialize, or
  write raw values to workspace files, the world-model, manifests, reports, or
  receipts.
- Use `Shape.prohibited` for hard safety boundaries rather than burying
  boundaries in strategies.
- Keep private scratch in `workspace/` (never fingerprinted, never subscribed)
  and publish only the maintained truth through the canonical world-model.
- Avoid sending every delegate the whole manifest or full context when a smaller
  binding satisfies the contract.

## Best Practices

- When the task is one competent session, write one function or one
  responsibility; do not manufacture orchestration.
- When the outcome matters more than choreography, use Contract Markdown only.
- When exact order, bounded loops, retries, gates, or branch logic matter, use `### Execution`.
- Make every `### Returns` / `### Maintains` item an obligation: named output, evaluable quality bar, and any degradation case.
- Put caller-supplied values in `### Parameters` / `### Requires`; put runtime-provided secrets/config in `### Environment`.
- Use conditional returns for graceful degradation: "if X unavailable: produce Y with caveats."
- Use `### Errors` for named failures that should propagate, not for ordinary alternate outcomes.
- Use `### Invariants` for properties true on success and failure, not as a cleanup checklist.
- Use `each` when collection completeness matters: every item must satisfy the postcondition.
- Give coordinating renders explicit `### Shape`: `self`, `delegates`, and `prohibited`.
- Treat `workspace/` as private scratch and the published world-model as the subscribable truth.
- For fan-out review, make reviewers independent and give synthesis explicit conflict-resolution duties.
- For worker-critic loops, require verdict, blocking issues, suggestions, and bounded exhaustion behavior.
- For implementation workflows, separate design, edit, review, test, and final synthesis roles.
- For reusable patterns, promote repeated control flow into patterns with explicit slot contracts.
- For large corpora, chunk semantically, analyze independently, and synthesize conflicts explicitly.
- For recurring workflows, keep cursors and high-water marks as material fields of the maintained truth.
- For prior-run analysis, use `run` / `run[]`, record provenance, and surface staleness warnings.
- For tests, use fixtures plus semantic `expects` / `expects-not`; test contracts, not exact phrasing.
- For responsibilities, declare the maintained truth and its canonicalization spec; let Forme wire `### Requires` to `### Maintains` and let `### Continuity` carry the cadence.
- For security-sensitive renders, express hard boundaries as `Shape.prohibited`, not strategies.
- For model-improvable behavior, specify the desired result and leave discovery strategy open.

## Anti-Patterns

- Turning every prompt into Prose just because Prose exists.
- Writing a giant natural-language prompt inside `### Maintains` or `### Returns`.
- Using vague outputs like "good report," "complete analysis," or "high quality result."
- Passing API keys or secrets through `### Requires` or `### Parameters`.
- Letting a coordinating render also execute the leaf work it coordinates.
- Giving every subagent the whole manifest "for context."
- Using conversation history to shuttle large artifacts instead of the world-model.
- Having downstream responsibilities read upstream `workspace/` scratch instead of the published world-model.
- Treating undeclared workspace files as subscribable truth.
- Returning the full artifact in the render completion message.
- Adding `### Execution` to compensate for weak contracts.
- Writing unbounded loops or "repeat until good" without a max and exhaustion path.
- Serializing independent reviewer/scanner work.
- Parallelizing work that secretly depends on shared mutable scratch.
- Splitting into tiny functions whose outputs are not independently useful.
- Creating a mega-responsibility with many maintained truths and no shape.
- Using the same generic output name everywhere, creating wiring ambiguity.
- Ignoring hard ambiguity warnings instead of clarifying contracts.
- Treating semantic wiring like brittle string matching.
- Hiding fallback behavior in `Strategies` instead of conditional `Returns` / postconditions.
- Declaring catch-all `error` without names, evidence, or recovery implications.
- Omitting the `### Maintains` canonicalization spec so a re-polled feed always looks changed.
- Subscribing to free-form rendered prose instead of the structured truth it is rendered from.
- Reintroducing a `### Memory` reads/writes ledger instead of the one persisted world-model.
- Reintroducing a judge / verdict / pressure / fulfillment beat to gate commits.
- Logging or echoing environment variable values.
- Letting reviewers see private worker reasoning when the pattern requires an information firewall.
- Writing tests that assert exact wording rather than observable behavior.
- Using human gates for vague approval instead of a concrete artifact decision.
- Fixing harness bugs by making every render more procedural.
- Encoding runtime machinery in responsibility files instead of preserving
  responsibilities as semantic contracts.
- Writing one mega-render that re-derives every downstream truth on each event,
  instead of a cheap classifier fanning per-domain signals — cost scales with the
  clock, not surprise.
- Giving a narrow transform render the whole repo/filesystem and an open-ended
  task ("summarize everything"); it wanders and the context (not the turn count)
  explodes. Scope the task and bound the inputs in `### Invariants`.
- Claiming "cost scales with surprise" without a deterministic selective-wake
  check and a judged quality pass.
- Over-tiering a one-shot or single-responsibility job — manufacturing
  classifier/facet machinery where one render would do.
