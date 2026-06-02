---
name: platform-improver
kind: function
---

# Platform Improver

Given an inspection report and a symptom description, diagnose whether the issue belongs to the OpenProse authoring layer, the Forme wiring layer, or the OpenProse VM host runtime layer, and propose a targeted fix for the correct layer. The three-layer architecture (OpenProse authoring/Forme wiring/OpenProse VM host runtime) means that a single symptom can have its root cause in any layer, and fixing the wrong layer creates compensatory complexity.

### Parameters

- inspection: run — a completed inspector run showing the problematic behavior
- symptom: description of what went wrong or what should be better (e.g., "services ran sequentially despite no dependencies", "output was empty despite no errors", "wrong model was used for the critic service")

### Returns

- diagnosis: structured analysis containing:
    - layer: which layer owns the fix — "prose" (the system's `*.prose.md` source files), "forme" (the wiring algorithm in std/ops/wire), or "host-runtime" (the OpenProse VM / host runtime execution engine)
    - confidence: 0-100 confidence that this is the correct layer
    - reasoning: chain of evidence from symptom to layer attribution
    - root_cause: precise description of what went wrong in the identified layer
    - proposed_fix: description of the change needed
    - diff: unified diff against the relevant source file (system source for prose, wire.prose.md for forme, OpenProse VM/Forme specs for host-runtime)
    - side_effects: what else might change if this fix is applied
    - verification: how to verify the fix works (which eval to run, what to look for)
- if symptom is ambiguous: diagnosis includes alternative hypotheses ranked by likelihood
- the returned diagnosis names exactly one primary layer; when the root cause spans layers, the secondary layer is recorded only as a follow-up, never as a second simultaneous fix
- the proposed fix never makes a layer more complex to compensate for another layer's bug — the returned change leaves the system simpler or equal

Two error returns are possible:

- insufficient-evidence: the inspection does not contain enough data to diagnose the symptom
- symptom-not-reproducible: the inspection shows no evidence of the described symptom

### Invariants

- never propose fixing two layers simultaneously — if the root cause spans layers, identify the primary layer and note the secondary as a follow-up
- never make a layer more complex to compensate for another layer's bug — the fix must make the system simpler or equal, never more complex

### Strategies

- when triaging to prose layer: the issue is in what the author wrote — bad contracts, missing strategies, wrong shapes, insufficient error declarations. The fix is editing the system's `*.prose.md` source files.
- when triaging to forme layer: the issue is in how services were wired — wrong dependency resolution, incorrect execution order, missed parallelization, bad contract matching. The fix is in `std/ops/wire` or the wiring algorithm.
- when triaging to host-runtime layer: the issue is in how the OpenProse VM executed the run — session spawning errors, binding copy failures, vm.log.md corruption, context management bugs, delegation protocol errors. The fix is in the host runtime spec or implementation.
- when the symptom could be any layer: start with the most common cause (prose > forme > host-runtime — author errors are more common than wiring bugs, which are more common than host runtime bugs)

### Execution

The diagnosis runs as three internal stages, each a `session` whose output feeds the next; none of these stages is a node — they are ephemeral sub-agents internal to producing the returned diagnosis.

1. **Triage** — read the inspection output and symptom, determine which layer most likely owns the issue. This is the critical judgment — misattribution means wasted effort. Produce a `triage` layer attribution containing:
    - primary_layer: "prose", "forme", or "host-runtime"
    - confidence: 0-100
    - evidence: list of specific inspection findings that point to this layer
    - alternative_layers: list of other plausible layers with lower confidence and reasoning
    - symptom_category: classification of the symptom type (e.g., "execution_order", "missing_output", "wrong_model", "contract_violation", "state_corruption", "delegation_failure")

   Triage strategies:
    - indicators of prose layer issues: contract violations (ensures not satisfied), shape violations (service did work it should delegate), missing error handling (undeclared errors), vague strategies (no concrete guidance)
    - indicators of forme layer issues: wrong execution order despite correct dependency declarations, services wired to wrong inputs, missing parallelization despite independent services, incorrect manifest generation
    - indicators of host-runtime layer issues: vm.log.md markers missing or malformed, bindings not copied despite workspace containing the output, session spawning failures, delegation protocol errors, context window exhaustion
    - when confidence is below 60: require the analyst stage to investigate all plausible layers before committing

2. **Analyze** — deep-dive into the identified layer. Read the relevant source files and trace the causal chain from symptom to root cause. Take the `triage`, the inspection, and the symptom; produce an `analysis` containing:
    - root_cause: precise description of the bug or deficiency
    - causal_chain: ordered list of events from root cause to observed symptom
    - affected_file: path to the file that needs changing
    - affected_section: specific section or lines within the file
    - current_behavior: what the affected code/spec currently does
    - desired_behavior: what it should do instead

   This stage may raise insufficient-evidence when it cannot trace from symptom to root cause with available data.

   Analysis strategies:
    - for prose layer: read `root.prose.md` and the `sources/*.prose.md` snapshots from the inspection run. Trace which contract clause is violated, which shape boundary is breached, or which strategy is missing.
    - for forme layer: read forme.manifest.json from the inspection run. Compare the wiring graph against what the service contracts should produce. Check if `std/ops/wire` would produce different output with a fix.
    - for host-runtime layer: read vm.log.md event markers in detail. Compare actual execution trace against what forme.manifest.json prescribes. Look for gaps, ordering violations, or protocol errors in the session spawning and binding copy sequence.
    - when the triage confidence was low: investigate the alternative layers too and present findings for all candidates

3. **Propose** — generate the concrete fix: a diff against the correct source file, with side effect analysis and verification plan. Take the `analysis` and the `triage`; produce the final `diagnosis` matching the top-level `### Returns` schema, with diff and verification plan.

   Propose strategies:
    - when the fix is in prose layer: generate a diff against the system's source `*.prose.md` file. The system author applies this.
    - when the fix is in forme layer: generate a diff against `std/ops/wire.prose.md`. This is a standard library change.
    - when the fix is in host-runtime layer: generate a diff against the relevant OpenProse VM or host runtime spec. This is a platform change — flag it for maintainer review.
    - for side effect analysis: consider what other systems or evals might be affected by this change. A host-runtime-layer fix affects all systems. A forme-layer fix affects all multi-service systems. A prose-layer fix affects only the specific system.
    - for verification: specify which eval to run (inspector at depth:deep, contract-grader, or regression-tracker) and what the expected outcome should be after the fix
