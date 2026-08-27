---
name: compose
kind: function
version: 0.16.0
---

# Compose

Progressively design and materialize an OpenProse program while keeping the
human architect's mental model coherent. Compose may explore broadly behind the
scenes, but exposes only a small architectural frontier at a time.

This function powers `prose compose`. `prose init` invokes it in `bootstrap`
mode after establishing the OpenProse root and harness selection.

Compose maintains two deliberately separate feedback loops:

1. **Program architecture** — what this program promises, which Contracts it
   needs, how values and authority cross boundaries, and what it renders.
2. **OpenProse feedback** — where designing the program reveals pressure on the
   language, standard library, interpreter guidance, compiler, adapter ABI, or
   authoring experience.

Program decisions progressively update one coherent OpenProse directory
package. Its root `index.prose.md` expresses system-level intent and
composition; nearby Contract files own their local promises. The architecture
model is reconstructed from that package plus its decision history—it is not a
parallel source of truth. OpenProse feedback is recorded only as candidate
feedback. It never changes the language, standard library, skill, or harness
implementation during `prose compose`.
After classification and deduplication, maintainer-authorized feedback is filed
as an issue on the public OpenProse repository for separate implementation.

### Parameters

- `mode`: one of `bootstrap`, `compose`, `review`, or `reflect`; default
  `compose`
- `request`: the user's current design goal, question, correction, rough
  workflow, or feedback
- `interactive`: whether the host may ask targeted questions; default `true`
- `persistence`: `persist` or `preview`; default `persist`
- `authority_scope`: `project-author` or `openprose-maintainer`; default
  `project-author`
- `framework_maturity`: `experimental`, `stabilizing`, or `stable`; default
  `experimental` until project configuration says otherwise
- `subjects`: optional completed run IDs, inspection reports, or source paths
  to consider in `review` or `reflect` mode

### Returns

- `architecture`: a working projection of the current program package containing:
    - intent and desired renders
    - topology profiles selected for the whole system or named regions, with
      compact ASCII shorthand and the evidence for each selection
    - Contract inventory and one-line promises
    - parameters, Returns, maintained projections, capabilities, and important
      exclusions at each boundary
    - call, data, state, and authority relationships
    - relevant standard-library composition candidates
    - harness capability requirements
    - scenarios, failure behavior, decisions, assumptions, and open questions
- `architecture_changes`: changes made or proposed during this invocation,
  with rationale
- `contract_proposals`: Contracts to add, split, merge, remove, or revise,
  including which resolved changes were materialized into source
- `test_strategy`: ordered tests that progressively constrain the program from
  its public promise down to Contract boundaries, failure behavior, portability,
  and performance
- `visual_map`: a derived Mermaid Contract map plus a compact ASCII topology
  shorthand and concise legends for call, data, maintained-state, and
  capability relationships
- `program_diagnostics`: findings about this program, ordered by architectural
  impact
- `openprose_feedback`: zero or more candidate feedback records, each with:
    - observation: what the design session exposed
    - pressure: why the current OpenProse surface made the work harder, less
      clear, less portable, or less expressive
    - layer: `language`, `standard-library`, `interpreter`, `compiler`,
      `adapter`, `authoring`, `visualization`, or `documentation`
    - scope: `project-specific`, `possibly-general`, `repeated`, or
      `maintainer-direction`
    - evidence: answers, architecture decisions, source locations, runs, or
      scenarios supporting the record
    - candidate_change: the smallest currently plausible change
    - alternatives: viable ways to address the pressure without changing that
      layer
    - maturity_effect: how the proposal should be treated at the current
      framework maturity
    - status: `candidate`, `already-filed`, or `filed`
    - issue_url: public issue when one already exists or was filed
- `feedback_publication`: issues found, filed, or prepared as drafts, including
  why any candidate was not published
- `constraint_lattice`: established, provisional, disputed, and superseded
  constraints, including the orthogonal constraints that triangulate each
  important architectural concept
- `active_frontier`: at most three architectural concepts currently exposed
  for human attention, with why each is active and what decision would close it
- `mental_model_sync`: concise restatement of the current system, what changed,
  which earlier constraints remain load-bearing, and where uncertainty remains
- `source_projection`: complete Contract source for resolved regions plus
  clearly marked placeholders for unresolved regions; never disguise a
  placeholder as settled source
- `visual_artifact`: a generated, self-contained HTML view derived from the
  architecture and constraint lattice
- `next_actions`: small ordered set such as another composition question,
  `prose write`, `prose compile`, or an evidence-gathering run
- `final_status_summary`: concise status, files updated, Contracts proposed,
  unresolved decisions, feedback candidates, and next action

### Errors

- `architecture-unresolved`: a missing decision prevents a coherent Contract
  boundary or desired render; include the exact decision without inventing it
- `architecture-conflict`: current source, architecture, and the user's new
  direction make incompatible claims; preserve both claims and ask which wins
- `persistence-failed`: the program package or supporting records could not be updated;
  return the proposed update without claiming it was written
- `insufficient-evidence`: `reflect` was requested but the subjects do not
  support the proposed program or OpenProse conclusion

### Invariants

- Begin from the desired render: what should be true after the program runs
  that was not true before. Do not begin by asking how many agents the user
  wants.
- Turn the desired render into a package-level `kind: test` before internal
  decomposition hardens. Tests constrain architecture; they are not merely a
  validation batch written after implementation.
- A proposed Contract boundary must earn its existence through an independent
  promise, useful isolation, distinct authority, reusable composition,
  independently useful output, separate state ownership, parallelism, or
  different runtime needs.
- Do not manufacture orchestration when one competent Contract is sufficient.
- Expose no more than three active architectural concepts to the user at once.
  Internal agent fan-out may be wider; the human-facing frontier may not.
- Triangulate important concepts with orthogonal constraints. Do not let one
  decomposition axis define the architecture by itself.
- Before asking for another decision, provide a compact mental-model sync:
  current scope, relevant settled constraints, new pressure, and the decision
  now being divided.
- Prefer multiple-choice questions whose options partition the remaining
  concept space. Always permit correction or an option the model missed.
- Use spaced repetition for load-bearing constraints: resurface an earlier
  decision when new work depends on it, appears to contradict it, or enough
  architectural distance has accumulated that drift is plausible.
- Support zooming without losing position. A zoomed-in Contract view retains
  its path to the desired render; a zoomed-out system view preserves unresolved
  details instead of flattening them away.
- Keep program diagnostics and OpenProse feedback separate. A defect in one
  program is not automatically a language defect.
- Materialize Contract source continuously as architecture resolves. Mark
  provisional and unresolved regions explicitly; never present them as frozen.
- Compose may update source files it created or regions explicitly marked as
  Compose-managed. It must ask before replacing human-frozen procedure or
  changing a public Contract promise.
- Never modify OpenProse framework, standard-library, skill, compiler, adapter,
  or documentation source during composition.
- `authority_scope: openprose-maintainer` permits explicit
  `maintainer-direction` feedback; it does not bypass the separation or apply
  changes automatically.
- In `experimental` maturity, foundational changes are legitimate candidates
  and may be based on explicit maintainer direction. Mark uncertainty and
  compatibility consequences rather than suppressing the proposal.
- In `stabilizing` maturity, prefer repeated evidence, executable examples,
  and migration plans for semantic changes.
- In `stable` maturity, require compatibility analysis and strong evidence for
  semantic changes; prefer library or guidance changes when they solve the
  pressure without changing the language.
- The OpenProse directory package is the canonical authored truth. Its
  `index.prose.md` owns system-level intent and composition; each child Contract
  owns its promise and interface. Supporting architecture records explain or
  visualize the package but never override it.
- Compose owns only source it created or regions explicitly marked
  Compose-managed. Generated `dist/`, run evidence, human-frozen source, and
  upstream OpenProse files remain outside its unilateral write boundary.
- The visual map is derived from the program package and decision records. It
  is never a second, independently edited source of truth.
- Generated HTML is disposable and derived. It must identify the source
  package revision and may never carry architectural facts absent from the
  package or its explicitly provisional source markers.
- Static architecture describes what may happen. Runtime traces describe what
  did happen. Never present one as the other.
- Ask one highest-leverage question at a time when practical, or at most three
  tightly related questions in one interaction. Accept narrative answers that
  resolve several gaps at once.
- Do not ask questions whose answers are already available in nearby source,
  architecture, configuration, or run evidence.
- Preserve unresolved decisions explicitly. Do not create false architectural
  certainty to make the diagram look complete.
- Keep discovered candidate procedure separate from frozen, source-controlled
  procedure.
- Contract source crystallizes incrementally. Resolved regions may become full
  source while unresolved regions remain explicit proposals or placeholders.
- Do not ask for secrets or include raw environment values in architecture or
  feedback artifacts.

### Tools

- `ask_user`: targeted architecture questions when the host supports them
- filesystem read/list/search: read-only landscape and evidence inspection
- filesystem write: limited to `<openprose-root>/architecture/` and explicitly
  Compose-managed source regions when `persistence` is `persist`
- public issue search/create: optional; limited to the canonical OpenProse
  repository and only for classified OpenProse feedback

### Strategies

- Work backward from desired renders, observable Returns, and maintained
  projections before naming Contracts.
- Prefer questions that change a boundary, interface, state owner, authority
  boundary, failure policy, or harness requirement.
- Name Contract promises before discussing their procedures.
- For each proposed call, make the downward arguments and upward Returns
  explicit; record learnings separately from Returns.
- Identify what each frame must not see as well as what it receives.
- Distinguish semantic work from mechanics that should be deterministic code.
- Reuse standard-library Contracts when their promises and invariants fit;
  never select a pattern by name alone.
- Challenge coordination Contracts that also perform their children's work.
- Use scenario walkthroughs to expose hidden coupling: ordinary success, one
  child failure, incomplete settlement, partial fan-out, budget exhaustion,
  state conflict, prohibited context leakage, and resume/re-entry.
- When a difficulty may be either a weak program design or a framework gap,
  state both hypotheses and propose the cheapest discriminating example or run.
- Treat explicit maintainer corrections as important design evidence, while
  still recording affected layer, alternatives, and compatibility pressure.
- Keep `next_actions` short. Prefer the one action that resolves the most
  architectural uncertainty.

### Execution

```prose
let landscape = call architecture-landscape-scanner
  request: request
  subjects: subjects

let current = call architecture-loader
  landscape: landscape
  mode: mode

let gaps = call architecture-gap-modeler
  request: request
  current: current
  landscape: landscape
  framework_maturity: framework_maturity

let frontier = call architectural-frontier-selector
  gaps: gaps
  current: current
  request: request

let exploration = call orthogonal-constraint-explorer
  frontier: frontier
  current: current
  landscape: landscape

let sync = call mental-model-synchronizer
  current: current
  frontier: frontier
  exploration: exploration

let elicitation = call architecture-elicitor
  frontier: frontier
  exploration: exploration
  mental_model_sync: sync
  current: current
  landscape: landscape
  interactive: interactive

if elicitation has blocking missing decisions:
  throw {
    error: "architecture-unresolved",
    missing_decisions: elicitation.blocking_missing_decisions,
    known_architecture: current.summary,
    retry_request_hint: elicitation.retry_request_hint
  }

let topology = call topology-profile-selector
  current: current
  request: request
  elicitation: elicitation
  exploration: exploration
  landscape: landscape

let test_intent = call test-intent-designer
  current: current
  request: request
  elicitation: elicitation
  topology: topology
  landscape: landscape

let candidate = call architecture-designer
  current: current
  request: request
  elicitation: elicitation
  exploration: exploration
  topology: topology
  test_intent: test_intent
  mental_model_sync: sync
  landscape: landscape

let test_suite = call test-suite-projector
  candidate: candidate
  test_intent: test_intent
  current: current
  landscape: landscape

parallel:
  let critique = call architecture-critic
    candidate: candidate
    test_suite: test_suite
    landscape: landscape
    subjects: subjects

  let feedback = call openprose-feedback-classifier
    candidate: candidate
    current: current
    request: request
    landscape: landscape
    subjects: subjects
    authority_scope: authority_scope
    framework_maturity: framework_maturity

let feedback_publication = call openprose-feedback-publisher
  feedback: feedback
  authority_scope: authority_scope
  landscape: landscape

let rendered = call architecture-renderer
  candidate: candidate
  critique: critique
  feedback: feedback_publication
  test_suite: test_suite

let source_projection = call contract-source-projector
  rendered: rendered
  current: current
  test_suite: test_suite

let visual_artifact = call architecture-view-renderer
  rendered: rendered
  source_projection: source_projection

let persisted = call architecture-persister
  rendered: rendered
  source_projection: source_projection
  visual_artifact: visual_artifact
  persistence: persistence
  landscape: landscape

return {
  architecture: rendered.architecture,
  architecture_changes: rendered.architecture_changes,
  contract_proposals: rendered.contract_proposals,
  test_strategy: test_suite.test_strategy,
  visual_map: rendered.visual_map,
  program_diagnostics: critique.program_diagnostics,
  openprose_feedback: feedback_publication.openprose_feedback,
  feedback_publication: feedback_publication.feedback_publication,
  constraint_lattice: rendered.constraint_lattice,
  active_frontier: frontier.active_frontier,
  mental_model_sync: sync.mental_model_sync,
  source_projection: source_projection.source_projection,
  visual_artifact: visual_artifact.visual_artifact,
  next_actions: rendered.next_actions,
  final_status_summary: persisted.final_status_summary
}
```
