---
name: architecture-designer
kind: function
version: 0.16.0
---

# Architecture Designer

Update the program architecture from the known intent and elicited decisions.

### Parameters

- `current`: prior architecture
- `request`: current request
- `elicitation`: new answers and decisions
- `exploration`: orthogonal constraint analysis
- `topology`: selected whole-system and regional topology profiles, including
  their lowering into existing OpenProse mechanisms
- `test_intent`: public promise, prohibited outcomes, and representative
  scenarios that the architecture must make testable
- `mental_model_sync`: shared working model used for the decision
- `landscape`: source and runtime facts

### Returns

- `candidate`: proposed architecture, change set, Contract proposals, source
  mismatches, scenarios, and next actions

### Strategies

- Give each Contract a one-line promise before detailing procedure.
- Use package-level test intent to challenge decomposition. Every important
  observable must have an owner and every prohibited outcome an enforceable
  boundary.
- Choose Contract boundaries in light of the selected topology; do not choose a
  topology merely to rationalize boundaries already invented.
- Allow different named regions to use different profiles. Treat a hybrid as a
  composition of explicit regional profiles, not as an uninformative catch-all.
- Record call edges separately from data, state, and capability edges.
- Name each data edge as `Return.field -> Parameter.field` when known.
- Preserve distinctions between current source, proposed architecture, and
  discovered candidate procedure.
- Use the source projector for progressive whole-program source; recommend
  `prose write` when one Contract needs focused authoring outside this cycle.
- Recommend `prose compile` only after blocking architectural gaps are closed.

---

## architecture-landscape-scanner

Read the local OpenProse landscape without changing it.

### Parameters

- `request`: current user request
- `subjects`: optional run or source references

### Returns

- `landscape`: OpenProse root, architecture files, source files, compiled
  manifests, recent relevant runs, installed standard-library index, harness
  configuration, and facts relevant to the current request

### Invariants

- Read-only.
- Prefer focused files and indexes over loading the entire repository.
- Do not treat generated manifests or runtime traces as authored intent.

---

## architecture-loader

Reconstruct the working architecture from the existing program package and its
supporting decision history, or establish an empty bootstrap model.

### Parameters

- `landscape`: scanner output
- `mode`: requested Architect mode

### Returns

- `current`: normalized projection of package source, decisions, assumptions, open
  questions, prior feedback candidates, frozen source facts, and discovered
  procedure candidates

### Strategies

- Treat the target directory package's `index.prose.md` and nearby Contract
  files as the canonical current architecture.
- Use `<openprose-root>/architecture/decisions.md` for durable decisions and
  rejected alternatives.
- Use `<openprose-root>/architecture/openprose-feedback.md` for candidate
  framework feedback.
- Treat decision and feedback records as provenance, never as overrides for
  Contract source.
- If the target package does not exist in `bootstrap` mode, return an empty
  model so the source projector can establish its `index.prose.md`; do not
  invent its contents here.

---

## architecture-gap-modeler

Find the highest-value unknowns in the current architecture.

### Parameters

- `request`: current design request
- `current`: loaded architecture
- `landscape`: local facts
- `framework_maturity`: current OpenProse maturity

### Returns

- `gaps`: ranked unknowns across desired render, inputs, Contract promises,
  interfaces, context exclusions, state ownership, capabilities, composition,
  failure behavior, evidence, and harness requirements

### Strategies

- Rank gaps by how many downstream decisions they affect.
- A missing desired render outranks naming and file-layout questions.
- A disputed Contract boundary outranks procedure details inside either side.
- Record possible framework pressure, but do not classify it here.

---

## architectural-frontier-selector

Limit the human-facing design surface without limiting internal exploration.

### Parameters

- `gaps`: ranked architecture gaps
- `current`: current architecture and constraint lattice
- `request`: current user direction

### Returns

- `active_frontier`: one to three concepts containing:
    - concept and current architectural level
    - why it is active now
    - settled constraints that bound it
    - orthogonal axes still needed to triangulate it
    - decision that would close or materially narrow it
- `deferred_frontier`: important concepts intentionally kept outside the
  current human working set, each with the decision or event that should bring
  it back

### Invariants

- Never expose more than three active concepts.
- Prefer one concept when it dominates downstream architecture.
- Deferring a concept preserves it; it does not silently resolve or discard it.
- Before opening a new concept, resurface any deferred commitment whose return
  condition has been met.
- A settled decision with an unperformed materialization step outranks a new
  design question. Perform or explicitly block the step first.

---

## orthogonal-constraint-explorer

Explore each active concept from independent axes so one decomposition does not
run away with the design.

### Parameters

- `frontier`: active architectural concepts
- `current`: current architecture and constraints
- `landscape`: local source, standard-library, harness, and evidence facts

### Returns

- `exploration`: for each active concept:
    - independent conceptual fan-outs
    - agreements and contradictions among them
    - orthogonal constraint seeds such as desired render, information boundary,
      state ownership, authority, failure behavior, cost, portability, and UX
    - option set that efficiently partitions the remaining concept space
    - recommendation with uncertainty, never a hidden decision

### Strategies

- Many agents may investigate one conceptual task; do not confuse agent count
  with conceptual breadth.
- Use no more than three conceptual fan-outs at once.
- Give parallel investigators distinct axes rather than near-duplicate briefs.
- Fan in before opening another conceptual task.

---

## topology-profile-selector

Select an architectural shape only after the purpose, desired render, and
load-bearing constraints are understood, and before Contract decomposition is
allowed to harden.

### Parameters

- `current`: current architecture and any prior topology selections
- `request`: current design request
- `elicitation`: newly resolved context and constraints
- `exploration`: orthogonal options and tradeoffs
- `landscape`: installed standard-library patterns, topology guidance, and
  canonical examples

### Returns

- `topology`: one or more named regions containing:
    - selected topology profile and status: `proposed` or `settled`
    - context signals and counter-signals supporting the selection
    - compact ASCII shorthand using the profile's standard notation
    - likely Contract boundaries and state ownership
    - lowering plan using only existing mechanisms: ProseScript `call`, a
      `pattern:` instance, or `Requires` ↔ `Maintains` subscriptions
    - compatible nested profiles and relevant standard-library patterns
    - canonical examples and unresolved topology questions

### Strategies

- Load topology profiles through progressive disclosure: show a one-line name,
  thumbnail, and fit statement first; load full guidance only for plausible
  candidates.
- Distinguish architectural levels instead of placing every shape in one flat
  list. A pipeline is usually intra-render coordination; a reactive renderer is
  a lifecycle and state model; a bus is an integration shape; fan-out/fan-in is
  a coordination shape.
- Prefer small labeled diagrams over symbolic shorthand. The diagram should say
  what moves, why a branch exists, and where results meet. For example:

      Pipeline
      [Research] -> [Draft] -> [Review]

      Fan out, then combine
                        +-> [Security review] -+
      [Change request] -+-> [API review] ------+-> [Combined findings]
                        +-> [UX review] -------+

      Maintain a projection when its inputs change
      [New event or changed input] -> [Render Contract] -> [Updated projection]
                                              ^                    |
                                              +-- future change ---+

      Publish once, deliver to interested Contracts
                               +-> [Billing Contract]
      [Incoming event] -> [Topic] -> [Analytics Contract]
                               +-> [Notification Contract]
- Names such as `A`, `B`, and `topic` are acceptable only after the architect
  already knows what they denote. The first disclosed view uses domain labels,
  not notation that requires a legend.
- Prefer ordinary relationship words such as `calls`, `publishes`, `updates`,
  and `combines` when arrows alone leave the semantics ambiguous.
- Treat the ASCII view as a mental-model thumbnail, not source or executable
  syntax. It must expand into named Contracts and typed relationships before
  source projection.
- Store reusable architecture profiles separately from executable coordination
  patterns. Profiles may recommend and link to patterns; they do not execute.
- Do not introduce runtime semantics for a profile annotation. Record language
  pressure only if repeated programs cannot lower the profile faithfully into
  calls, patterns, and subscriptions.

---

## architecture-critic

Stress-test the proposed program without broadening it.

### Parameters

- `candidate`: proposed architecture
- `test_suite`: ordered package and Contract tests
- `landscape`: local facts
- `subjects`: optional run evidence

### Returns

- `program_diagnostics`: ranked findings with affected Contract or edge,
  evidence, consequence, and smallest corrective decision

### Strategies

- Check that every Contract boundary earns its cost.
- Check that the package-level tests observe public behavior rather than
  implementation trivia, and that Contract tests align with their declared
  promises.
- Check that every required Return has a consumer or top-level purpose.
- Check for ambient context, authority widening, shared mutable scratch,
  coordinator collapse, implicit joins, ambiguous state ownership, and missing
  failure paths.
- Distinguish static architecture findings from observed runtime failures.
- Do not turn style preferences into blocking diagnostics.

---

## architecture-renderer

Render one coherent architecture update and its derived visual map.

### Parameters

- `candidate`: proposed architecture
- `critique`: program diagnostics
- `feedback`: classified OpenProse feedback
- `test_suite`: ordered tests and current readiness gates

### Returns

- `architecture`: complete human-readable architecture
- `constraint_lattice`: settled, provisional, disputed, and superseded
  constraints with their relationships and evidence
- `architecture_changes`: focused change list
- `contract_proposals`: source-level changes, with materialization status
- `visual_map`: Mermaid Contract graph derived from the architecture
- `next_actions`: no more than three ordered actions

### Strategies

- Keep the default Contract map readable; split call/data, state, capability,
  and runtime views when one graph would become ambiguous.
- Mark proposed Contracts and edges differently from frozen source.
- Include unresolved questions near the affected Contract or relationship.
- Do not include raw transcript or scratch in the architecture.

---

## architecture-persister

Persist only Compose-owned architecture and source projections.

### Parameters

- `rendered`: rendered architecture and feedback
- `source_projection`: progressive Contract source
- `visual_artifact`: derived HTML architecture view
- `persistence`: `persist` or `preview`
- `landscape`: root and existing architecture files

### Returns

- `final_status_summary`: status, mode, persistence result, architecture files
  updated, Contracts proposed, unresolved decisions, feedback candidates, and
  next action

### Errors

- `persistence-failed`: an owned file could not be written

### Strategies

- In `preview`, return the complete proposed contents and write nothing.
- In `persist`, update the canonical target directory package first:
    - `<program-root>/index.prose.md`
    - `<program-root>/*.prose.md` for Compose-managed child Contracts
- Then update supporting, non-authoritative records:
    - `<openprose-root>/architecture/decisions.md`
    - `<openprose-root>/architecture/openprose-feedback.md`
    - `<openprose-root>/architecture/view.html`
- Persist resolved and explicitly provisional Compose-managed source in the
  target package. Ask before changing a human-frozen region or public promise.
- Keep system-level intent, desired renders, topology, and composition in the
  root Contract without duplicating child Contract promises. Keep unresolved
  decisions as explicit provisional markers beside the source they affect.
- Mark every Contract and relationship as `proposed`, `frozen-source`, or
  `observed-runtime` so design intent and evidence cannot blur together.
- Keep each decision in `decisions.md` under a stable `ARCH-*` identifier with
  status, decision, rationale, alternatives, evidence, and affected Contracts.
- Keep each framework feedback record in `openprose-feedback.md` under a stable
  `OPF-*` identifier using the complete top-level feedback schema.
- Treat `view.html` as generated and replaceable; never recover canonical
  architecture from it.
- Preserve user-authored notes and prior decisions; append or revise by stable
  heading rather than replacing the files wholesale.
- Deduplicate feedback records by observation, layer, and affected construct.
- Report every source file and region changed, including its provenance and
  whether it remains provisional.
