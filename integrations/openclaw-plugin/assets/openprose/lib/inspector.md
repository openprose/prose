---
name: inspector
kind: program
services: [index, extractor, evaluator, synthesizer]
---

requires:
- run-path: path to the run to inspect (e.g., .prose/runs/20260119-100000-abc123)
- depth: inspection depth -- "light" (fast heuristic evaluation) or "deep" (thorough analysis with evidence)
- target: evaluation target -- "vm" (runtime fidelity), "task" (program effectiveness), or "all" (both)

ensures:
- inspection: structured inspection output containing a verdict JSON object (with scores and pass/fail per dimension), a mermaid flow diagram of actual execution, and a narrative summary report

errors:
- invalid-run: the specified run path does not exist or is not a valid run directory
- no-state: the run has no state.md file (may be incomplete or corrupted)

strategies:
- for light depth: focus on state.md markers and manifest compliance, skip deep session log analysis
- for deep depth: read workspace artifacts, analyze session outputs for quality, check invariant satisfaction
- when target is "all": evaluate VM fidelity and task effectiveness independently, then synthesize

invariants:
- the verdict JSON contains scores for every evaluated dimension, never partial results
- the mermaid diagram accurately reflects the actual execution path from state.md, not the planned path from manifest.md
- light and deep inspections of the same run must not contradict on pass/fail verdicts (light may be less detailed but not opposite)

---

## index

requires:
- run-path: path to the run directory

ensures:
- inventory: complete file listing of the run directory with file sizes and modification times, identification of which services ran, and structural validation (manifest.md exists, state.md exists, expected directories present)

errors:
- invalid-run: the specified run path does not exist or is not a valid run directory

strategies:
- validate run directory structure against the expected layout from prose.md
- flag missing or unexpected files early so downstream services can account for gaps

---

## extractor

requires:
- inventory: file listing and structural validation of the run
- run-path: path to the run directory
- depth: inspection depth

ensures:
- artifacts: extracted execution data including parsed state.md events, manifest.md caller interface and graph, per-service input/output bindings, and (for deep depth) workspace contents and session logs

errors:
- no-state: the run has no state.md file

strategies:
- for light depth: extract state.md events and manifest structure only
- for deep depth: additionally read workspace files, check output quality, and extract session-level details
- parse state.md markers according to the marker format defined in prose.md

---

## evaluator

requires:
- artifacts: extracted execution data
- target: evaluation target (vm, task, or all)
- depth: inspection depth

ensures:
- evaluation: per-dimension scores and pass/fail verdicts for the requested target(s). VM dimensions: manifest compliance, state tracking correctness, contract enforcement, error handling. Task dimensions: output quality, contract satisfaction, strategy adherence, efficiency.

strategies:
- for VM evaluation: compare actual execution (from state.md) against expected execution (from manifest.md), check that bindings match ensures contracts, verify error handling followed the spec
- for task evaluation: assess whether the program's ensures were meaningfully satisfied (not just formally present), check strategy adherence, evaluate output quality relative to the stated goal
- score each dimension 0-10 with a brief justification

---

## synthesizer

requires:
- evaluation: per-dimension scores and verdicts

ensures:
- inspection: final inspection output with verdict JSON (all scores and pass/fail), mermaid flow diagram of actual execution path, and narrative summary highlighting strengths, weaknesses, and specific improvement suggestions

strategies:
- generate the mermaid diagram from the execution trace, showing service dependencies, parallel execution, and any errors or retries
- in the narrative summary: lead with the overall verdict, then detail each dimension, then suggest concrete improvements
- format the verdict JSON for machine readability (other programs like vm-improver and program-improver consume it)
