---
name: platform-improver
kind: program
---

# Platform Improver

Given an inspection report and a symptom description, diagnose whether the issue belongs to the Prose language layer, the Forme framework layer, or the Press runtime layer, and propose a targeted fix for the correct layer. The three-layer architecture (Prose/Forme/Press) means that a single symptom can have its root cause in any layer, and fixing the wrong layer creates compensatory complexity.

### Services

- triager
- analyst
- proposer

### Requires

- inspection: run — a completed inspector run showing the problematic behavior
- symptom: description of what went wrong or what should be better (e.g., "services ran sequentially despite no dependencies", "output was empty despite no errors", "wrong model was used for the critic service")

### Ensures

- diagnosis: structured analysis containing:
    - layer: which layer owns the fix — "prose" (the program's `.prose.md` files), "forme" (the wiring algorithm in std/ops/wire), or "press" (the runtime execution engine)
    - confidence: 0-100 confidence that this is the correct layer
    - reasoning: chain of evidence from symptom to layer attribution
    - root_cause: precise description of what went wrong in the identified layer
    - proposed_fix: description of the change needed
    - diff: unified diff against the relevant source file (program source for prose, wire.md for forme, prose.md/forme.md specs for press)
    - side_effects: what else might change if this fix is applied
    - verification: how to verify the fix works (which eval to run, what to look for)
- if symptom is ambiguous: diagnosis includes alternative hypotheses ranked by likelihood

### Errors

- insufficient-evidence: the inspection does not contain enough data to diagnose the symptom
- symptom-not-reproducible: the inspection shows no evidence of the described symptom

### Invariants

- never propose fixing two layers simultaneously — if the root cause spans layers, identify the primary layer and note the secondary as a follow-up
- never make a layer more complex to compensate for another layer's bug — the fix must make the system simpler or equal, never more complex

### Strategies

- when triaging to prose layer: the issue is in what the author wrote — bad contracts, missing strategies, wrong shapes, insufficient error declarations. The fix is editing the program's `.prose.md` files.
- when triaging to forme layer: the issue is in how components were wired — wrong dependency resolution, incorrect execution order, missed parallelization, bad contract matching. The fix is in `std/ops/wire` or the wiring algorithm.
- when triaging to press layer: the issue is in how the runtime executed — session spawning errors, binding copy failures, state.md corruption, context management bugs, delegation protocol errors. The fix is in the runtime spec or implementation.
- when the symptom could be any layer: start with the most common cause (prose > forme > press — author errors are more common than framework bugs, which are more common than runtime bugs)

---

## triager

Read the inspection output and symptom, determine which layer most likely owns the issue. This is the critical judgment — misattribution means wasted effort.

### Requires

- inspection: the inspection run binding
- symptom: the symptom description

### Ensures

- triage: layer attribution containing:
    - primary_layer: "prose", "forme", or "press"
    - confidence: 0-100
    - evidence: list of specific inspection findings that point to this layer
    - alternative_layers: list of other plausible layers with lower confidence and reasoning
    - symptom_category: classification of the symptom type (e.g., "execution_order", "missing_output", "wrong_model", "contract_violation", "state_corruption", "delegation_failure")

### Strategies

- indicators of prose layer issues: contract violations (ensures not satisfied), shape violations (service did work it should delegate), missing error handling (undeclared errors), vague strategies (no concrete guidance)
- indicators of forme layer issues: wrong execution order despite correct dependency declarations, services wired to wrong inputs, missing parallelization despite independent services, incorrect manifest generation
- indicators of press layer issues: state.md markers missing or malformed, bindings not copied despite workspace containing the output, session spawning failures, delegation protocol errors, context window exhaustion
- when confidence is below 60: require the analyst to investigate all plausible layers before committing

---

## analyst

Deep-dive into the identified layer. Read the relevant source files and trace the causal chain from symptom to root cause.

### Requires

- triage: layer attribution from triager
- inspection: the inspection run binding
- symptom: the symptom description

### Ensures

- analysis: detailed root cause analysis containing:
    - root_cause: precise description of the bug or deficiency
    - causal_chain: ordered list of events from root cause to observed symptom
    - affected_file: path to the file that needs changing
    - affected_section: specific section or lines within the file
    - current_behavior: what the affected code/spec currently does
    - desired_behavior: what it should do instead

### Errors

- insufficient-evidence: cannot trace from symptom to root cause with available data

### Strategies

- for prose layer: read the program's `.prose.md` files from the inspection run's `services/` snapshot and `program.md`. Trace which contract clause is violated, which shape boundary is breached, or which strategy is missing.
- for forme layer: read the manifest.md from the inspection run. Compare the wiring graph against what the component contracts should produce. Check if `std/ops/wire` would produce different output with a fix.
- for press layer: read state.md event markers in detail. Compare actual execution trace against what manifest.md prescribes. Look for gaps, ordering violations, or protocol errors in the session spawning and binding copy sequence.
- when the triage confidence was low: investigate the alternative layers too and present findings for all candidates

---

## proposer

Generate the concrete fix: a diff against the correct source file, with side effect analysis and verification plan.

### Requires

- analysis: root cause analysis from analyst
- triage: layer attribution from triager

### Ensures

- diagnosis: the final output matching the program's top-level ensures schema, with diff and verification plan

### Strategies

- when the fix is in prose layer: generate a diff against the program's source `.prose.md` file. The program author applies this.
- when the fix is in forme layer: generate a diff against `std/ops/wire.md`. This is a standard library change.
- when the fix is in press layer: generate a diff against the relevant spec file (`prose.md` for execution semantics, `forme.md` for wiring semantics). This is a platform change — flag it for maintainer review.
- for side effect analysis: consider what other programs or evals might be affected by this change. A press-layer fix affects all programs. A forme-layer fix affects all multi-service programs. A prose-layer fix affects only the specific program.
- for verification: specify which eval to run (inspector at depth:deep, contract-grader, or regression-tracker) and what the expected outcome should be after the fix
