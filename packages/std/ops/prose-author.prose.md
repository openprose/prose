---
name: prose-author
kind: function
version: 0.15.0
---

# Prose Author

Turn pseudo-Prose, logical English, or rough workflow notes into current
Contract Markdown source that is ready for a Prose Complete host to run, lint,
test, or compile.

This is OpenProse for making OpenProse: a source authoring workflow for helping
people get valid Prose programs faster, similar in spirit to skills that help
authors create new skills.

Use this when a caller knows the workflow they want but has not yet written the
`*.prose.md` source. The system may return one standalone file or a small
folder-shaped package with an `index.prose.md` root contract and nearby
function, gateway, responsibility, pattern, or test files.

Direct in-harness `prose write` is interactive by default: after a read-only
landscape scan and initial shape/root decision, ask a small number of targeted
questions when the host can satisfy the OpenProse `ask_user` primitive. The
shell CLI may mark the run non-interactive because it can only pass argv/stdin
up front; in that mode, return `unresolved-intent` with concrete missing
decisions instead of guessing.

### Parameters

- `output_mode`: output mode requested by the caller. `prose write` passes
  `source-package-only`; in that mode the system must return source content and
  apply notes only.
- `apply`: whether this run is allowed to write generated source into the
  caller's repository. `prose write` passes `false`.
- `run_state`: preferred run-state mode. `prose write` passes `in-context` so
  package-only authoring avoids creating run artifacts in the caller's
  workspace when the host can honor that mode.
- `terminal_summary`: whether a concise final terminal status block is required.
  `prose write` passes `required`.
- `interactive`: whether the host may ask targeted follow-up questions before
  source planning. Defaults to `true` for direct in-harness `prose write`; shell
  CLI wrappers may pass `false`.
- `request`: pseudo-Prose, logical English, copied notes, or a rough workflow
  brief. The request may include preferred kind, target path, whether the
  output should be a single file or folder, required inputs, outputs, tools,
  skills, memory, responsibilities, gateways, tests, and naming preferences.

### Returns

- `source_package`: fully validated generated OpenProse program containing:
    - package shape: `single-file` or `folder`
    - one or more `.prose.md` files with every path and full file content
    - complete Contract Markdown source using current sections
    - optional patch-style apply notes when the request named a target path
- `lint_report`: validation report with status `pass`, no blocking findings,
  and any non-blocking warnings that a human should review
- `authoring_notes`: concise explanation of the chosen shape, assumptions,
  local landscape scan, shape/root decision, shape-specific guidance loaded,
  unresolved optional questions, and recommended next commands
- `final_status_summary`: short terminal-friendly summary containing status,
  package shape, root file or root folder, `apply`, files written, lint status,
  and next command; it appears after the source package so CLI users can see
  success or failure without rereading the full package
- if safe source generation requires more input and `interactive` is available:
  ask targeted questions before source planning and incorporate the answers
- if safe source generation requires more input and `interactive` is false or
  unavailable: signal `unresolved-intent` with an `unresolved_intent` envelope
  and no `source_package`
- if valid source cannot be produced within the repair budget: signal
  `validation-failed` instead of publishing a passing `source_package`

### Errors

- `unresolved-intent`: the request is too underspecified to choose a safe
  function, responsibility, pattern, gateway, test shape, target root, or
  root file. The error payload contains:
    - `error`: `unresolved-intent`
    - `missing_decisions`: concrete decisions the caller must provide
    - `landscape_facts`: read-only facts that informed the refusal
    - `assumptions_not_made`: unsafe assumptions the authoring system refused
      to invent
    - `retry_request_hint`: concise text the caller can add to the next
      non-interactive request
    - no `source_package`
- `validation-failed`: the candidate source still has blocking lint findings
  after repair attempts

### Invariants

- Source authoring does not begin until the local landscape has been scanned,
  the shape/root decision has been recorded, interactive triage has completed
  or been explicitly declined, and the required guidance set has been loaded.
- Landscape inspection is read-only: it may list and read nearby source,
  configuration, and OpenProse layout markers, but it must not create, modify,
  delete, format, install, compile, or migrate files.
- When `output_mode` is `source-package-only` or `apply` is `false`, generated
  files are returned as source package content and optional apply notes only.
  The authoring run must not write generated files to the caller's repository,
  even when the request names a target path.
- In `source-package-only` and `apply: false` mode, prefer in-context run state
  and avoid creating OpenProse `runs/` artifacts in the caller's workspace.
  If a host creates unavoidable control-plane artifacts, the final summary must
  distinguish those from generated source files and still report
  `files_written: none`.
- When `terminal_summary` is `required`, omitting `final_status_summary` is a
  contract failure even when the source package and lint report are otherwise
  valid.
- Generated source uses current Contract Markdown: `###` sections, frontmatter
  `name` and `kind`, and backticked contract item names where practical.
- Every generated program file path ends in `.prose.md`.
- The retired internally-autowired graph kind is not generated. Composition is
  intra-node imperative `call` (ProseScript in `### Execution`) within a single
  contract, or a cross-node `### Requires` → `### Maintains` subscription that
  Forme wires across responsibilities — never a third graph kind.
- A generated contract that composes named sub-units folds them into `call`
  statements in `### Execution`; every `call` target resolves within the
  returned file tree or to an explicit installed dependency reference.
- A generated multi-unit single file uses `##` inline sub-unit boundaries
  and keeps all contract sections at `###`.
- A generated `kind: responsibility` declares `### Requires` →
  `### Maintains`, includes stable `id:` frontmatter and a `### Tools`
  section (using `(none)` when no host capabilities are required), and
  declares its wake-source in `### Continuity` (input-driven by default).
- A generated `kind: function` declares `### Parameters` → `### Returns`
  (a plain call interface, no world-model and no `### Continuity`).
- A generated `kind: gateway` stays thin: it is sugar for an
  external-driven `responsibility` with no `### Requires`, `### Maintains`
  for the incoming truth, and an external-driven `### Continuity`
  (webhook / cron / manual trigger).
- A generated `kind: test` supplies all required fixtures and uses semantic
  assertions over observable bindings, not exact phrasing.
- `### Execution` is used only when order, loops, retries, gates, or branches
  are part of the requirement. Otherwise the source stays declarative.
- The linter runs after the initial draft and after every repair. The system
  must not claim lint success while blocking diagnostics remain.
- Interactive host runs use `ask_user` for a small number of blocking
  shape/root/path decisions. Non-interactive runs must not rely on `ask_user`,
  `gate()`, or any other mid-run caller interaction; missing blocking decisions
  produce `unresolved-intent`.
- Generated source must not include secrets, environment values, private
  product strategy, or hosted-product assumptions unless the request explicitly
  asks for a public runtime hook.
- Authoring may describe operational side effects in generated source, but must
  not invoke external operational systems while authoring. PagerDuty, Slack,
  issue trackers, status pages, deploy systems, feature flags, and similar
  integrations are declarations or future runtime tools in the returned
  package, never actions performed by `prose-author`.

### Tools

- `cli:node`: used for deterministic structural checks and UUIDv7-compatible
  responsibility id generation when a responsibility file is produced

### Strategies

- Prefer the smallest valid artifact: one `function` for one competent
  session, a `function` (or `responsibility`) with `### Execution` `call`s
  when composition matters, a pattern for reusable control flow, a
  gateway for ingress, a test for behavior checks, and a `responsibility`
  for a standing, subscribable truth.
- If the request implies several unrelated workflows, split only when the
  files share one public root contract (a `function` or `responsibility`).
  Otherwise return a validation error naming the split that should be
  requested separately.
- When the request is ambiguous but a conservative valid shape is clear, choose
  it and record the assumption in `authoring_notes`.
- When ambiguity affects root, path, side effects, persistence, or whether a
  responsibility/runtime source is required, prefer `unresolved-intent` over a
  misleading generated package.
- Preserve user terminology for domain outputs, but normalize file names and
  sub-unit names into lower-kebab-case.
- Prefer folder output for contracts with three or more sub-units, responsibility
  runtime source, or tests; prefer a single file for a compact single-unit or
  two-unit example.
- For dependencies, use explicit installed references such as `std/...`,
  `co/...`, or `github.com/owner/repo/path`. Do not invent bare `owner/repo`
  registry references.
- Do not write directly to the caller's repository. Return a package and patch
  notes; a separate file-writing step can apply it after human review.
- Treat any request phrase such as "under src/foo" or "add it to this repo" as
  a desired package path when `apply: false`, not as permission to create files.
- Use CLI-facing language for `prose write`: describe the result as an
  authoring command response, not as "not a shell command" or a recursive
  wrapper warning.
- Prefer asking over refusing when the host supports interaction and the only
  blockers are a few concrete shape, root, path, persistence, or side-effect
  policy decisions.

### Execution

```prose
let authoring_intent = call intent-normalizer
  request: request
  output_mode: output_mode
  apply: apply
  run_state: run_state
  terminal_summary: terminal_summary
  interactive: interactive

let landscape = call landscape-scanner
  authoring_intent: authoring_intent

let shape_decision = call shape-root-decider
  authoring_intent: authoring_intent
  landscape: landscape

let triage_result = call interactive-triage
  authoring_intent: authoring_intent
  landscape: landscape
  shape_decision: shape_decision
  interactive: interactive

if triage_result has blocking missing decisions:
  throw {
    error: "unresolved-intent",
    missing_decisions: triage_result.blocking_missing_decisions,
    landscape_facts: landscape.relevant_facts,
    assumptions_not_made: triage_result.assumptions_refused,
    retry_request_hint: triage_result.retry_request_hint
  }

let guidance_report = call guidance-loader
  authoring_intent: triage_result.authoring_intent
  landscape: landscape
  shape_decision: triage_result.shape_decision

let source_plan = call source-planner
  authoring_intent: triage_result.authoring_intent
  landscape: landscape
  shape_decision: triage_result.shape_decision
  guidance_report: guidance_report

let draft_source_package = call source-author
  source_plan: source_plan
  authoring_intent: triage_result.authoring_intent
  landscape: landscape
  shape_decision: triage_result.shape_decision
  guidance_report: guidance_report
  output_mode: output_mode
  apply: apply

let lint_report = call source-linter
  draft_source_package: draft_source_package
  source_plan: source_plan
  shape_decision: triage_result.shape_decision
  guidance_report: guidance_report

loop while lint_report has blocking findings (max: 3):
  draft_source_package = call source-repairer
    draft_source_package: draft_source_package
    lint_report: lint_report
    source_plan: source_plan
    shape_decision: triage_result.shape_decision
    guidance_report: guidance_report

  lint_report = call source-linter
    draft_source_package: draft_source_package
    source_plan: source_plan
    shape_decision: triage_result.shape_decision
    guidance_report: guidance_report

if lint_report still has blocking findings:
  throw "validation-failed"

let assembled = call package-assembler
  draft_source_package: draft_source_package
  lint_report: lint_report
  source_plan: source_plan
  landscape: landscape
  shape_decision: triage_result.shape_decision
  guidance_report: guidance_report

return {
  source_package: assembled.source_package,
  lint_report: lint_report,
  authoring_notes: assembled.authoring_notes,
  final_status_summary: assembled.final_status_summary
}
```

---

## intent-normalizer

Normalize the caller's rough request into an explicit authoring intent.

### Parameters

- `request`: pseudo-Prose, logical English, copied notes, or rough workflow
  brief from the caller
- `output_mode`: caller output mode, usually `source-package-only`
- `apply`: whether this authoring run may write files, usually `false`
- `run_state`: preferred run-state mode, usually `in-context`
- `terminal_summary`: whether the final status block is required
- `interactive`: whether targeted follow-up questions are allowed before source
  planning; default `true` in agent-host `prose write`

### Returns

- `authoring_intent`: structured intent containing:
    - goal: what the generated Prose must accomplish
    - preferred_shape: `single-file`, `folder`, or `unspecified`
    - likely_kinds: function, responsibility, gateway, test, pattern, or
      a small combination of those kinds (there is no `system` kind)
    - public_inputs: caller-supplied data the source should require or take as parameters
    - public_outputs: the truth the source should maintain or the values it should return
    - operational_context: environment variables, tools, skills, dependencies,
      persistence, memory, and safety boundaries implied by the request
    - output_mode: caller output mode, preserved for downstream authoring
    - apply: caller apply flag, preserved for downstream authoring
    - run_state: caller run-state preference, preserved for downstream
      authoring
    - terminal_summary: caller terminal-summary requirement, preserved for
      downstream authoring
    - interactive: whether `ask_user` may be used during pre-authoring triage
    - assumptions: conservative assumptions made because the request was
      incomplete
    - blockers: missing facts that prevent safe source generation

### Errors

- `unresolved-intent`: no coherent goal, output, or runnable shape can be
  inferred from the request

### Strategies

- Treat pseudo-Prose and logical English as source material, not as final
  syntax.
- Recognize common pseudo-Prose shorthands and translate them into Contract
  Markdown intent:
    - `input name` means a public input named `name`: a `### Parameters`
      item for a `function`, or a `### Requires` subscription for a
      `responsibility`
    - `input:` or `Inputs:` with comma-separated fields means public input
      items (`### Parameters` or `### Requires`) normalized to lower_snake_case
    - `return name` means a public output named `name`: a `### Returns`
      item for a `function`, or a `### Maintains` field for a `responsibility`
    - `return a, b, and c` means preserve each named domain output separately,
      normalized to lower_snake_case
    - `session "..."` usually means a named sub-unit invoked by an
      intra-node `call` in `### Execution`
    - `loop until/while ... (max: N)` means pinned bounded ProseScript
      choreography with the natural-language condition preserved
- Recognize `for each ... in parallel` and `run these checks in parallel` as
  explicit fan-out/fan-in requirements, not merely strategy hints.
- Recognize `if`/`else` branches as control-flow requirements when the branch
  controls paging, notifications, go/no-go decisions, mitigation, publishing,
  or other side effects.
- Treat words such as verify, evidence, source links, confidence, provenance,
  claim, and citation as requiring first-class evidence/provenance outputs.
- Treat approval loops as requiring review notes carried into the next round
  and a review history or approval record output.
- Treat page, notify, create channel, publish, execute, rollback, feature flag,
  status update, and issue creation as side-effect signals that require an
  explicit sub-unit boundary and safety gate.
- Extract obligations before implementation details. Desired outputs and
  invariants matter more than proposed step order.
- When the request says "always", "keep", "monitor", "every", "when event
  happens", or "before deadline", consider whether a responsibility plus
  gateway is appropriate.
- When the request lists concrete ordered steps, decide whether those are true
  requirements or just a rough path the author used to explain intent.
- Keep unresolved optional choices as assumptions. Use `unresolved-intent` only
  when choosing a shape would be unsafe or misleading.

---

## landscape-scanner

Inspect the current repository landscape without modifying it.

### Parameters

- `authoring_intent`: normalized authoring intent from `intent-normalizer`

### Returns

- `landscape`: read-only local context containing:
    - current working directory and nearest repository boundary
    - detected OpenProse roots: native repository root, attached
      `.agents/prose`, and user-global `~/.agents/prose` when relevant
    - presence or absence of `src/`, `prose.lock`, `.agents/prose`, `dist/`,
      `runs/`, `state/`, and `deps/`
    - existing functions, responsibilities, gateways, patterns, tests,
      and evals found under likely OpenProse source roots
    - nearby package conventions, README guidance, and whether the caller
      appears to be authoring a new OpenProse project or adding a sidecar to an
      existing application repository
    - scan_limits: roots inspected, roots skipped, and why

### Invariants

- The scan is read-only. It must not create, modify, delete, format, install,
  compile, migrate, or otherwise mutate repository files.
- The scan stays bounded to likely project and OpenProse roots; it ignores
  generated state such as `dist/`, `runs/`, `state/`, `deps/`, and dependency
  directories unless those paths are the subject of the request.

### Strategies

- Treat a repository with `prose.lock` or populated `src/*.prose.md` as a likely
  native OpenProse root unless the request explicitly names sidecar or
  user-global output.
- Treat `.agents/prose` as an attached OpenProse root for ordinary application
  repositories that should not become native OpenProse repositories.
- Treat `~/.agents/prose` as user-global only when the request asks for a
  reusable personal agent, cross-repository memory, or user-scoped state.
- Prefer facts over guesses: record unknowns in `landscape` rather than filling
  them in with assumptions.

---

## shape-root-decider

Choose and record the generated program shape and OpenProse root before source
planning begins.

### Parameters

- `authoring_intent`: normalized authoring intent from `intent-normalizer`
- `landscape`: read-only local context from `landscape-scanner`

### Returns

- `shape_decision`: explicit decision record containing:
    - program_shape: one of:
        - compact single-file contract (`function` or `responsibility`)
        - imperative-heavy single `index.prose.md` with `### Execution`
        - multi-unit folder with `index.prose.md` plus private sub-units
        - native OpenProse repository rooted at the repository root
        - attached sidecar OpenProse root under `repo/.agents/prose`
        - user-global agent under `~/.agents/prose`
    - package_shape: `single-file` or `folder`
    - target_root_mode: `native`, `attached`, `user-global`, or `package-only`
    - target_root_path and root_file, using root-relative paths when a concrete
      root is known
    - private_subunit_dir when a folder shape contains non-public sub-units
    - rationale grounded in the request and landscape scan
    - confidence: `high`, `medium`, or `low`
    - assumptions that are safe enough to proceed
    - blocking_missing_decisions that make generation unsafe
    - assumptions_refused: unsafe assumptions not made
    - retry_request_hint: concise text the caller can add to the next
      non-interactive request when generation is blocked

### Errors

- `unresolved-intent`: the request and landscape do not provide enough
  information to choose a safe shape, target root, or root file

### Strategies

- Choose compact single-file output for one sub-unit, a tiny two-unit example,
  or a self-contained contract that remains readable with inline `##` sub-unit
  boundaries.
- Choose an imperative-heavy single `index.prose.md` when the request is mostly
  bounded choreography: loops, retries, gates, parallel fan-out/fan-in,
  conditionals, or pinned `call` choreography.
- Choose a multi-unit folder when there are three or more sub-units,
  reusable private sub-units, tests, side effects, responsibility/gateway source,
  or a graph that should be edited unit-by-unit later.
- Choose a native OpenProse root only when the landscape already looks native or
  the user is clearly creating an OpenProse repository.
- Choose an attached sidecar root for ordinary application repositories where
  generated Prose should live alongside, not inside, the app source.
- Choose user-global only when the user asks for a personal agent, cross-repo
  memory, or user-scoped durable behavior.
- If root/path ambiguity could cause source to be generated in the wrong
  project, signal `unresolved-intent` with concrete missing decisions instead
  of inventing a path.

---

## interactive-triage

Resolve blocking authoring decisions before source planning when the host can
ask the user.

### Parameters

- `authoring_intent`: normalized authoring intent from `intent-normalizer`
- `landscape`: read-only local context from `landscape-scanner`
- `shape_decision`: initial shape and root decision from `shape-root-decider`
- `interactive`: whether targeted follow-up questions are allowed

### Returns

- `triage_result`: decision record containing:
    - authoring_intent: updated intent after any accepted user answers
    - shape_decision: updated shape/root/path decision after any accepted user
      answers
    - questions_asked: concise list of questions asked and answers received, or
      empty when no interaction was needed
    - blocking_missing_decisions: unresolved blockers that still prevent safe
      generation
    - assumptions_refused: unsafe assumptions still refused
    - retry_request_hint: concise text to add to a non-interactive retry when
      blockers remain

### Invariants

- Ask only after the local landscape scan and initial decision are available,
  so questions are grounded in the current repository.
- Ask at most three focused questions in one triage pass.
- Do not ask broad preference questions when a conservative, valid default is
  already clear.
- Do not ask the user for secrets or raw environment values.

### Strategies

- Prefer multiple-choice or short-answer questions about concrete blockers:
  target root (`native`, `.agents/prose`, or `~/.agents/prose`), root path,
  package shape, persistence scope, and operational side-effect policy.
- When `interactive` is true and blockers are limited to a few concrete
  decisions, call `ask_user` and update the intent and shape decision from the
  answers.
- When `interactive` is false or the host cannot satisfy `ask_user`, do not
  stall. Preserve blockers in `blocking_missing_decisions` and return a
  `retry_request_hint`.
- If the answers introduce a new conflict, keep the blocker explicit rather
  than inventing a reconciliation.

---

## guidance-loader

Load the baseline and shape-specific OpenProse guidance required by the
decision before source planning and authoring.

### Parameters

- `authoring_intent`: normalized authoring intent from `intent-normalizer`
- `landscape`: read-only local context from `landscape-scanner`
- `shape_decision`: explicit shape and root decision from
  `interactive-triage`

### Returns

- `guidance_report`: loaded guidance record containing:
    - baseline docs: `contract-markdown.md`, `guidance/tenets.md`, and
      `guidance/authoring.md`
    - targeted docs loaded for the selected shape and rationale for each
    - docs intentionally skipped because the shape does not require them

### Invariants

- `source-planner` and `source-author` consume `guidance_report`; they must not
  author source from the baseline docs alone when the shape requires targeted
  language/runtime guidance.

### Strategies

- Load `prosescript.md` when generating imperative-heavy `### Execution`,
  bounded loops, retries, explicit parallelism, pinned choreography, or
  intra-node `call` order.
- Load `forme.md` when generating a multi-unit contract, cross-node
  subscription graph, pattern instance, explicit wiring, dependency reference,
  or composed folder.
- Load `responsibility-runtime.md` when generating responsibilities, gateways,
  standing subscribable truths, compile/serve-facing source, `### Continuity`
  wake-source semantics, or Reactor-facing behavior.
- Load `state/README.md` and `state/filesystem.md` when persistence, memory,
  run state, root layout, attached roots, native roots, or user-global roots
  affect the generated package.

---

## source-planner

Plan the generated file tree and contracts before drafting source.

### Parameters

- `authoring_intent`: normalized authoring intent from `intent-normalizer`
- `landscape`: read-only local context from `landscape-scanner`
- `shape_decision`: explicit shape and root decision from
  `interactive-triage`
- `guidance_report`: baseline and shape-specific guidance from
  `guidance-loader`

### Returns

- `source_plan`: concrete generation plan containing:
    - package_shape: `single-file` or `folder`
    - shape_decision: chosen program shape, target root mode, root path, root
      file, private sub-unit directory, and rationale
    - guidance_loaded: docs that must constrain the generated source
    - files: list of paths to generate, with `kind`, `name`, and purpose
    - composition_graph: sub-units (intra-node `call` targets), cross-node
      `### Requires` → `### Maintains` subscriptions, pattern instances, and
      expected wiring edges
    - contract_map: required sections per file — `### Parameters` / `### Returns`
      (function), `### Requires` / `### Maintains` / `### Continuity`
      (responsibility / gateway), and `### Errors`, `### Invariants`,
      `### Execution`, `### Strategies`, `### Runtime`, `### Shape`,
      `### Tools`, `### Skills`, and test sections by file
    - validation_checklist: blocking checks that `source-linter` must apply
    - next_commands: recommended commands after generation, such as
      `prose lint`, `prose test`, or `prose compile`

### Strategies

- Treat `shape_decision` as binding unless it conflicts with an explicit
  safety invariant or the linter proves it invalid. Do not silently switch root
  modes or package shape during drafting.
- Choose a single-file package only when all sub-units can remain readable with
  inline `##` headings and no responsibility runtime source is needed.
- Choose folder output when the graph is large, when tests accompany the source,
  when a responsibility/gateway pair exists, when the request asks for reusable
  workflow source, when parallel review/research branches are present, when
  operational side effects are present, or when future edits should be
  localized to individual sub-unit files.
- For a composed contract, every sub-unit named by a `call` in `### Execution`
  must have a corresponding inline section, sibling file, nested path, or
  explicit dependency reference.
- For responsibilities, plan a stable id, `### Requires` → `### Maintains`,
  a `### Continuity` wake-source, and a `### Tools` section. Use `(none)`
  only after checking that no host capability is implied.
- Include at least one test when the request asks for production-ready source or
  when behavior has a clear happy path and an important degradation path.
- For pseudo-Prose with two or more `session` lines, plan a single `function`
  (or `responsibility`) that composes them with intra-node `call`s in
  `### Execution`, unless the request explicitly asks for a reusable
  `kind: pattern`.
- For pseudo-Prose loops, require an explicit bound. If no bound is present,
  add a blocking validation item or choose a conservative bound and record that
  assumption in `authoring_notes`.
- For review loops, plan a carried-forward notes binding and an exhausted-loop
  outcome in the root contract.
- Preserve user-specified numeric bounds exactly in the planned `### Execution`
  block and in the validation checklist.
- For parallel research or review workflows, plan explicit `parallel for` or
  `parallel` choreography plus a synthesis step that receives every branch's
  declared outputs.
- For operational workflows, plan side-effect sub-units separately from analysis
  sub-units and require mitigation, paging, publishing, channel creation,
  rollback, or issue creation to be guarded by a prior condition or approval.
- Add review-history outputs for approval loops unless the request explicitly
  names an equivalent approval record.
- Add a validation checklist item that required targeted guidance was loaded
  for the chosen shape.

---

## source-author

Draft the planned source package.

### Parameters

- `source_plan`: concrete file tree and contract plan from `source-planner`
- `authoring_intent`: normalized authoring intent from `intent-normalizer`
- `landscape`: read-only local context from `landscape-scanner`
- `shape_decision`: explicit shape and root decision from
  `interactive-triage`
- `guidance_report`: baseline and shape-specific guidance from
  `guidance-loader`
- `output_mode`: caller output mode, usually `source-package-only`
- `apply`: whether this authoring run may write files, usually `false`

### Returns

- `draft_source_package`: complete candidate package containing:
    - file tree
    - full contents for every planned file
    - generated responsibility ids when needed
    - notes on any assumptions encoded into source

### Strategies

- Write valid source first, clever source second.
- Follow the loaded shape-specific guidance. Use `prosescript.md` for pinned
  intra-node `call` choreography, `forme.md` for cross-node subscription graph
  composition, and `responsibility-runtime.md` for responsibility, gateway,
  `### Continuity`, compile, or serve-facing source.
- Place generated files under the chosen root and root file from
  `shape_decision`; do not move between native, attached, user-global, or
  package-only output without returning `unresolved-intent`.
- In `source-package-only` or `apply: false` mode, include the chosen paths and
  full file contents in `draft_source_package`; do not write those paths to the
  filesystem.
- Use current Contract Markdown headings exactly. Unknown `###` sections may
  be preserved only as documentation, never as hidden runtime behavior.
- Make every `### Returns` item (function) and `### Maintains` field
  (responsibility) named, evaluable, and specific enough for a future agent
  or test to judge.
- Use `### Errors` for named failures, conditional `### Returns` /
  `### Maintains` postconditions for degraded success, and `### Invariants`
  for properties that hold regardless of outcome.
- Put runtime configuration and secrets in `### Environment`, not
  `### Requires`.
- Use `### Shape` to stop coordinator collapse: `self`, `delegates`, and
  `prohibited` should be explicit whenever boundaries matter.
- Keep ProseScript fenced as `prose`. Keep structured declarations fenced as
  `yaml`. Do not wrap ordinary Markdown sections in code fences.
- Convert pseudo `session "..."` lines into `call sub-unit-name` statements in
  `### Execution` when the generated contract composes named sub-units. Use raw
  `session` only when the request truly needs an ad hoc subagent inside the
  render, and explain that choice in `authoring_notes`.
- Emit explicit `parallel`, `parallel for`, `if`/`else`, and bounded `loop`
  ProseScript when the request names those control-flow requirements. Do not
  demote them to `### Strategies`.
- Preserve every domain output named by the caller's `return` text; do not
  collapse several outputs into a single vague `report` or `summary`.
- For approval loops, include the latest draft/result, approval state, notes,
  and exhausted-loop result in the returned shape.
- For side-effecting operations, name the sub-unit for the action and `call` it
  only after the gating condition or reviewer approval is available.

---

## source-linter

Validate the draft source package against current OpenProse authoring rules.

### Parameters

- `draft_source_package`: candidate source files from `source-author` or
  `source-repairer`
- `source_plan`: planned file tree and validation checklist
- `shape_decision`: explicit shape and root decision from
  `interactive-triage`
- `guidance_report`: baseline and shape-specific guidance from
  `guidance-loader`

### Returns

- `lint_report`: structured validation report containing:
    - status: `pass` or `fail`
    - blocking_findings: list of findings that prevent publishing the package
    - warnings: non-blocking issues a human should review
    - checks_run: every structural, contract, wiring, and authoring check
      applied
    - repaired_by: empty on first pass, or repair attempt identifiers after
      `source-repairer`

### Strategies

- Treat this as a lint gate, not a style review. A blocking finding is a defect
  that would make the generated source invalid, un-runnable, misleading, or
  unsafe.
- Check frontmatter: every file has `name` and valid `kind`; test files have
  `subject`; responsibility files have a valid-looking stable `id`.
- Check section legality by kind using Contract Markdown. Preserve unknown
  sections as documentation only when they do not pretend to be runtime
  semantics.
- Check composition resolvability: every sub-unit named by a `call` in
  `### Execution` resolves in the returned file tree, every `### Requires`
  subscription has a plausible `### Maintains` producer, and every dependency
  reference is explicit. The retired autowired-graph section and graph kind are
  never generated.
- Check shape/root compliance: generated paths match `shape_decision`, root
  mode and root file are stable, folder output includes an `index.prose.md`
  when promised, and private sub-units stay under the planned private sub-unit
  directory.
- Check return-only compliance: when `output_mode` is `source-package-only` or
  `apply` is `false`, the package contains file contents and apply notes rather
  than claims that repository files were created or modified.
- Check guidance compliance: every targeted doc required by the chosen shape is
  present in `guidance_report`, and the generated source follows the relevant
  constraints for ProseScript, Forme, Responsibility Runtime, and filesystem
  state layout.
- Check contract item quality: named outputs use backticks where practical,
  vague outputs like "good result" are rejected, and `each` clauses attach to a
  clear collection.
- Check ProseScript when present: fenced `prose`, `call` targets exist,
  variables flow from parameters/requires or prior outputs, loops have bounds,
  and the return shape satisfies `### Returns` / `### Maintains`.
- Check pseudo-Prose translations: no standalone `input`, `output`, or
  `return` declarations remain outside Contract Markdown or fenced ProseScript;
  no raw pseudo `session "..."` lines remain when they were intended as
  composed sub-units.
- Check output preservation: every concrete output named in the caller's return
  text appears as its own `### Returns` item (function) or `### Maintains` field
  (responsibility), or an explicitly documented field in a structured output.
- Check control-flow preservation: parallel fan-out/fan-in, `if`/`else`
  branches, and numeric loop bounds from the request appear in `### Execution`
  when they affect correctness or safety.
- Check approval loops: prior notes feed the next round, review history or an
  equivalent approval record is returned, and max-round exhaustion has a
  declared outcome.
- Check side-effect gates: operational actions such as paging, notifications,
  publishing, rollback, mitigation execution, channel creation, and issue
  creation occur only behind the condition or approval named by the request.
- Check responsibilities: `### Goal`, `### Requires`, `### Maintains`,
  `### Continuity`, `### Invariants`, and `### Tools` are present and semantic,
  not runtime machinery; there is no `### Criteria` or `### Fulfillment`.
- Check gateways: a gateway has no `### Requires`, `### Maintains` for the
  incoming truth, and an external-driven `### Continuity`; ingress/trigger
  details stay in gateway source rather than responsibility source.
- Check tests: fixtures cover subject inputs, assertions are semantic, and
  tests do not name pattern definitions as direct subjects.
- Check security: no raw secrets, no API key values, no hidden environment
  values, and no downstream reads from upstream `workspace/` paths.
- Check authoring side-effect safety: generated source may declare external
  operational actions, tools, and gates, but `prose-author` itself must not
  call or claim it contacted those external systems during authoring.
- Check interaction behavior: interactive host runs ask targeted questions
  before planning when that resolves blockers; non-interactive runs do not
  claim they can pause mid-run and keep unresolved blocking decisions explicit.
- Pass only when `blocking_findings` is empty.

---

## source-repairer

Repair blocking lint findings without changing the caller's intent.

### Parameters

- `draft_source_package`: candidate source files with blocking findings
- `lint_report`: validation report from `source-linter`
- `source_plan`: planned file tree and contract map
- `shape_decision`: explicit shape and root decision from
  `interactive-triage`
- `guidance_report`: baseline and shape-specific guidance from
  `guidance-loader`

### Returns

- `draft_source_package`: repaired candidate package with all blocking findings
  addressed or explicitly marked impossible to repair without changing intent
- `repair_notes`: concise list of changes made and any intentionally retained
  warnings

### Strategies

- Repair only defects named by `lint_report` or direct consequences of those
  defects.
- Do not broaden scope, add unrelated examples, or rewrite the package from
  scratch when a localized repair is enough.
- If a blocking finding reveals that the plan is wrong, repair the source to
  match the user's intent and record the plan correction in `repair_notes`.
- Prefer contract clarification over `### Execution` when a lint issue is
  caused by vague requirements.
- If an issue cannot be repaired without a missing user decision, keep the
  blocking finding and explain the exact missing decision.
- Do not repair an `unresolved-intent` situation by inventing a root, path,
  composition graph, persistence scope, or side-effect policy.

---

## package-assembler

Publish the validated source package and concise next-step notes.

### Parameters

- `draft_source_package`: final candidate package from `source-author` or
  `source-repairer`
- `lint_report`: passing lint report from `source-linter`
- `source_plan`: planned file tree and next commands
- `landscape`: read-only local context from `landscape-scanner`
- `shape_decision`: explicit shape and root decision from
  `interactive-triage`
- `guidance_report`: baseline and shape-specific guidance from
  `guidance-loader`

### Returns

- `source_package`: final source package containing:
    - package shape and root file
    - file tree
    - full contents for every file
    - patch-style apply notes when a target path was requested
    - recommended run, lint, test, or compile commands
- `authoring_notes`: concise notes containing:
    - assumptions made
    - landscape facts that affected root or shape
    - why the package is single-file, imperative single-file, folder-shaped,
      native-rooted, sidecar-rooted, user-global, or package-only
    - targeted guidance loaded before source authoring
    - warnings that remain non-blocking
    - what a human should review before applying the files
- `final_status_summary`: last visible section, no more than 8 lines, containing:
    - `status`: `pass`
    - `source_package`: `returned`
    - `shape`: chosen package shape
    - `root`: selected root file or root folder
    - `apply`: `false` for `prose write`
    - `files_written`: `none` when no generated source files were applied
    - `lint`: `pass`
    - `next`: recommended command or manual apply step

### Errors

- `validation-failed`: `lint_report.status` is not `pass`

### Strategies

- Do not publish a package when `lint_report` has blocking findings.
- Keep final output reviewable: include paths first, then file contents in the
  same order a human would open them.
- Do not claim files were written to the caller's repository unless this run
  actually wrote them through an explicitly requested file-writing step.
- End every successful package-only response with `final_status_summary` so a
  terminal user can distinguish success from validation failure at a glance.
- When `terminal_summary` is `required`, treat the final status block as part of
  the output contract, not an optional note.
