---
name: prose-author
kind: system
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
folder-shaped package with an `index.prose.md` system and nearby service,
gateway, responsibility, pattern, or test files.

### Services

- `intent-normalizer`
- `source-planner`
- `source-author`
- `source-linter`
- `source-repairer`
- `package-assembler`

### Requires

- `request`: pseudo-Prose, logical English, copied notes, or a rough workflow
  brief. The request may include preferred kind, target path, whether the
  output should be a single file or folder, required inputs, outputs, tools,
  skills, memory, responsibilities, gateways, tests, and naming preferences.

### Ensures

- `source_package`: fully validated generated OpenProse program containing:
    - package shape: `single-file` or `folder`
    - one or more `.prose.md` files with every path and full file content
    - complete Contract Markdown source using current sections
    - optional patch-style apply notes when the request named a target path
- `lint_report`: validation report with status `pass`, no blocking findings,
  and any non-blocking warnings that a human should review
- `authoring_notes`: concise explanation of the chosen shape, assumptions,
  unresolved optional questions, and recommended next commands
- if valid source cannot be produced within the repair budget: signal
  `validation-failed` instead of publishing a passing `source_package`

### Errors

- `unresolved-intent`: the request is too underspecified to choose a safe
  service, system, responsibility, pattern, gateway, or test shape
- `validation-failed`: the candidate source still has blocking lint findings
  after repair attempts

### Invariants

- Generated source uses current Contract Markdown: `###` sections, frontmatter
  `name` and `kind`, and backticked contract item names where practical.
- Every generated program file path ends in `.prose.md`.
- A generated `kind: system` has a non-empty `### Services` section whose
  entries resolve within the returned file tree or to explicit installed
  dependency references.
- A generated multi-service single file uses `##` inline service boundaries
  and keeps all contract sections at `###`.
- A generated `kind: responsibility` includes stable `id:` frontmatter and a
  `### Tools` section, using `(none)` when no host capabilities are required.
- A generated `kind: gateway` stays thin: ingress in `### Receives` or
  `### Schedule`, trigger target in `### Emits`, payload notes in `### Payload`.
- A generated `kind: test` supplies all required fixtures and uses semantic
  assertions over observable bindings, not exact phrasing.
- `### Execution` is used only when order, loops, retries, gates, or branches
  are part of the requirement. Otherwise the source stays declarative.
- The linter runs after the initial draft and after every repair. The system
  must not claim lint success while blocking diagnostics remain.
- Generated source must not include secrets, environment values, private
  product strategy, or hosted-product assumptions unless the request explicitly
  asks for a public runtime hook.

### Tools

- `cli:node`: used for deterministic structural checks and UUIDv7-compatible
  responsibility id generation when a responsibility file is produced

### Strategies

- Prefer the smallest valid artifact: one service for one competent session,
  a system when composition matters, a pattern for reusable control flow, a
  gateway for ingress, a test for behavior checks, and a responsibility for a
  standing goal.
- If the request implies several unrelated workflows, split only when the
  files share one public system or responsibility. Otherwise return a
  validation error naming the split that should be requested separately.
- When the request is ambiguous but a conservative valid shape is clear, choose
  it and record the assumption in `authoring_notes`.
- Preserve user terminology for domain outputs, but normalize file names and
  service names into lower-kebab-case.
- Prefer folder output for systems with three or more services, responsibility
  runtime source, or tests; prefer a single file for compact service-only or
  two-service examples.
- For dependencies, use explicit installed references such as `std/...`,
  `co/...`, or `github.com/owner/repo/path`. Do not invent bare `owner/repo`
  registry references.
- Do not write directly to the caller's repository. Return a package and patch
  notes; a separate file-writing step can apply it after human review.

### Execution

```prose
let authoring_intent = call intent-normalizer
  request: request

let source_plan = call source-planner
  authoring_intent: authoring_intent

let draft_source_package = call source-author
  source_plan: source_plan
  authoring_intent: authoring_intent

let lint_report = call source-linter
  draft_source_package: draft_source_package
  source_plan: source_plan

loop while lint_report has blocking findings (max: 3):
  draft_source_package = call source-repairer
    draft_source_package: draft_source_package
    lint_report: lint_report
    source_plan: source_plan

  lint_report = call source-linter
    draft_source_package: draft_source_package
    source_plan: source_plan

if lint_report still has blocking findings:
  throw "validation-failed"

let assembled = call package-assembler
  draft_source_package: draft_source_package
  lint_report: lint_report
  source_plan: source_plan

return {
  source_package: assembled.source_package,
  lint_report: lint_report,
  authoring_notes: assembled.authoring_notes
}
```

---

## intent-normalizer

Normalize the caller's rough request into an explicit authoring intent.

### Requires

- `request`: pseudo-Prose, logical English, copied notes, or rough workflow
  brief from the caller

### Ensures

- `authoring_intent`: structured intent containing:
    - goal: what the generated Prose must accomplish
    - preferred_shape: `single-file`, `folder`, or `unspecified`
    - likely_kinds: service, system, responsibility, gateway, test, pattern, or
      a small combination of those kinds
    - public_inputs: caller-supplied data the source should require
    - public_outputs: outputs the source should ensure
    - operational_context: environment variables, tools, skills, dependencies,
      persistence, memory, and safety boundaries implied by the request
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
    - `input name` means a public `### Requires` item named `name`
    - `input:` or `Inputs:` with comma-separated fields means public
      `### Requires` items normalized to lower_snake_case
    - `return name` means a public `### Ensures` item named `name`
    - `return a, b, and c` means preserve each named domain output separately,
      normalized to lower_snake_case
    - `session "..."` usually means a named service in the system graph
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
  explicit service boundary and safety gate.
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

## source-planner

Plan the generated file tree and contracts before drafting source.

### Requires

- `authoring_intent`: normalized authoring intent from `intent-normalizer`

### Ensures

- `source_plan`: concrete generation plan containing:
    - package_shape: `single-file` or `folder`
    - files: list of paths to generate, with `kind`, `name`, and purpose
    - root_file: the file the caller should run, test, or compile first
    - service_graph: services, subsystems, pattern instances, and expected
      wiring edges
    - contract_map: required `### Requires`, `### Ensures`, `### Errors`,
      `### Invariants`, `### Strategies`, `### Runtime`, `### Shape`,
      `### Tools`, `### Skills`, `### Memory`, and test sections by file
    - validation_checklist: blocking checks that `source-linter` must apply
    - next_commands: recommended commands after generation, such as
      `prose lint`, `prose test`, or `prose compile`

### Strategies

- Choose a single-file package only when all services can remain readable with
  inline `##` headings and no responsibility runtime source is needed.
- Choose folder output when the graph is large, when tests accompany the source,
  when a responsibility/gateway pair exists, when the request asks for reusable
  workflow source, when parallel review/research branches are present, when
  operational side effects are present, or when future edits should be
  localized to individual service files.
- For systems, every service in `### Services` must have a corresponding inline
  section, sibling file, subsystem path, or explicit dependency reference.
- For responsibilities, plan a stable id and a `### Tools` section. Use `(none)`
  only after checking that no judge or fulfillment capability is implied.
- Include at least one test when the request asks for production-ready source or
  when behavior has a clear happy path and an important degradation path.
- For pseudo-Prose with two or more `session` lines, plan a `kind: system`
  unless the request explicitly asks for a reusable `kind: pattern`.
- For pseudo-Prose loops, require an explicit bound. If no bound is present,
  add a blocking validation item or choose a conservative bound and record that
  assumption in `authoring_notes`.
- For review loops, plan a carried-forward notes binding and an exhausted-loop
  outcome in the root system contract.
- Preserve user-specified numeric bounds exactly in the planned `### Execution`
  block and in the validation checklist.
- For parallel research or review workflows, plan explicit `parallel for` or
  `parallel` choreography plus a synthesis step that receives every branch's
  declared outputs.
- For operational workflows, plan side-effect services separately from analysis
  services and require mitigation, paging, publishing, channel creation,
  rollback, or issue creation to be guarded by a prior condition or approval.
- Add review-history outputs for approval loops unless the request explicitly
  names an equivalent approval record.

---

## source-author

Draft the planned source package.

### Requires

- `source_plan`: concrete file tree and contract plan from `source-planner`
- `authoring_intent`: normalized authoring intent from `intent-normalizer`

### Ensures

- `draft_source_package`: complete candidate package containing:
    - file tree
    - full contents for every planned file
    - generated responsibility ids when needed
    - notes on any assumptions encoded into source

### Strategies

- Write valid source first, clever source second.
- Use current Contract Markdown headings exactly. Unknown `###` sections may
  be preserved only as documentation, never as hidden runtime behavior.
- Make every `### Ensures` item named, evaluable, and specific enough for a
  future agent or test to judge.
- Use `### Errors` for named failures, conditional `### Ensures` for degraded
  success, and `### Invariants` for properties that hold regardless of outcome.
- Put runtime configuration and secrets in `### Environment`, not
  `### Requires`.
- Use `### Shape` to stop coordinator collapse: `self`, `delegates`, and
  `prohibited` should be explicit whenever boundaries matter.
- Keep ProseScript fenced as `prose`. Keep structured service declarations and
  memory maps fenced as `yaml`. Do not wrap ordinary Markdown sections in
  code fences.
- Convert pseudo `session "..."` lines into `call service-name` statements
  when the generated source includes a service graph. Use raw `session` only
  when the request truly needs an ad hoc subagent outside the Contract Markdown
  graph, and explain that choice in `authoring_notes`.
- Emit explicit `parallel`, `parallel for`, `if`/`else`, and bounded `loop`
  ProseScript when the request names those control-flow requirements. Do not
  demote them to `### Strategies`.
- Preserve every domain output named by the caller's `return` text; do not
  collapse several outputs into a single vague `report` or `summary`.
- For approval loops, include the latest draft/result, approval state, notes,
  and exhausted-loop result in the returned shape.
- For side-effecting operations, name the service for the action and call it
  only after the gating condition or reviewer approval is available.

---

## source-linter

Validate the draft source package against current OpenProse authoring rules.

### Requires

- `draft_source_package`: candidate source files from `source-author` or
  `source-repairer`
- `source_plan`: planned file tree and validation checklist

### Ensures

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
- Check system resolvability: `### Services` is non-empty, every listed local
  service resolves in the returned file tree, and every dependency reference is
  explicit.
- Check contract item quality: named outputs use backticks where practical,
  vague outputs like "good result" are rejected, and `each` clauses attach to a
  clear collection.
- Check ProseScript when present: fenced `prose`, call targets exist,
  variables flow from requires or prior outputs, loops have bounds, and return
  shape satisfies `### Ensures`.
- Check pseudo-Prose translations: no standalone `input`, `output`, or
  `return` declarations remain outside Contract Markdown or fenced ProseScript;
  no raw pseudo `session "..."` lines remain when they were intended as
  services.
- Check output preservation: every concrete output named in the caller's return
  text appears as its own `### Ensures` item or explicitly documented field in a
  structured ensured output.
- Check control-flow preservation: parallel fan-out/fan-in, `if`/`else`
  branches, and numeric loop bounds from the request appear in `### Execution`
  when they affect correctness or safety.
- Check approval loops: prior notes feed the next round, review history or an
  equivalent approval record is returned, and max-round exhaustion has a
  declared outcome.
- Check side-effect gates: operational actions such as paging, notifications,
  publishing, rollback, mitigation execution, channel creation, and issue
  creation occur only behind the condition or approval named by the request.
- Check responsibilities: `Goal`, `Continuity`, `Criteria`, `Constraints`,
  `Tools`, and optional `Fulfillment` are semantic, not runtime machinery.
- Check gateways: routes, schedules, emits, and payload notes stay in gateway
  source rather than responsibility source.
- Check tests: fixtures cover subject inputs, assertions are semantic, and
  tests do not name pattern definitions as direct subjects.
- Check security: no raw secrets, no API key values, no hidden environment
  values, and no downstream reads from upstream `workspace/` paths.
- Pass only when `blocking_findings` is empty.

---

## source-repairer

Repair blocking lint findings without changing the caller's intent.

### Requires

- `draft_source_package`: candidate source files with blocking findings
- `lint_report`: validation report from `source-linter`
- `source_plan`: planned file tree and contract map

### Ensures

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

---

## package-assembler

Publish the validated source package and concise next-step notes.

### Requires

- `draft_source_package`: final candidate package from `source-author` or
  `source-repairer`
- `lint_report`: passing lint report from `source-linter`
- `source_plan`: planned file tree and next commands

### Ensures

- `source_package`: final source package containing:
    - package shape and root file
    - file tree
    - full contents for every file
    - patch-style apply notes when a target path was requested
    - recommended run, lint, test, or compile commands
- `authoring_notes`: concise notes containing:
    - assumptions made
    - why the package is single-file or folder-shaped
    - warnings that remain non-blocking
    - what a human should review before applying the files

### Errors

- `validation-failed`: `lint_report.status` is not `pass`

### Strategies

- Do not publish a package when `lint_report` has blocking findings.
- Keep final output reviewable: include paths first, then file contents in the
  same order a human would open them.
- Do not claim files were written to the caller's repository unless this run
  actually wrote them through an explicitly requested file-writing step.
