---
name: system-improver
kind: function
---

# System Improver

Given an inspection report and the inspected system's source, analyze the system for improvement opportunities and produce ranked proposals with diffs. This function operates on OpenProse contracts (`*.prose.md` source files) and understands the full contract surface: requires, maintains, errors, invariants, strategies, environment, and shapes.

### Parameters

- inspection: run — a completed inspector run whose output identifies issues with a system
- source-path: path to the system's source directory containing `*.prose.md` files

### Returns

- improvements: ranked list of improvement opportunities, each containing:
    - rank: priority position (1 = highest impact)
    - category: one of "contract" (maintains/requires/parameters/returns quality), "strategy" (missing or vague strategies), "shape" (delegation boundary violations), "structure" (sub-unit decomposition issues), "error-handling" (missing error declarations or conditional returns), "efficiency" (unnecessary sub-units or missing parallelization)
    - description: what the problem is
    - evidence: specific reference to inspection findings and system source
    - diff: proposed change as a unified diff against the source file
    - risk: "low" (safe refactor), "medium" (changes contract surface), or "high" (changes system behavior)
- if no improvements found: an empty list with an explanation of why the system is sound
- every returned improvement's `evidence` cites both a specific inspection finding and a specific source location, and every `diff` is minimal (one concern per diff, never a wholesale rewrite), with contract-violation and missing-error-handling improvements ranked above efficiency improvements

### Errors

- source-not-found: the source-path does not contain valid OpenProse system files
- inspection-invalid: the inspection run output is not a valid inspector report

### Strategies

- when analyzing contracts: check that every maintains clause is specific enough to evaluate — vague maintains like "a good report" are improvement targets
- when analyzing strategies: check that strategies cover the system's known failure modes — if the inspection shows failures, the system should have strategies to handle them
- when analyzing shapes: verify that services with shape.delegates actually delegate (not collapse), and services with shape.prohibited do not violate boundaries
- when proposing diffs: make minimal changes — one concern per diff. Never rewrite a system wholesale.
- when ranking: prioritize contract violations and missing error handling over efficiency improvements

### Execution

```prose
let located = call locator
  source-path: source-path
  inspection: inspection

let analysis = call analyst
  root-source: located.root-source
  service-sources: located.service-sources
  inspection-output: located.inspection-output

let result = call implementer
  analysis: analysis.analysis
  root-source: located.root-source
  service-sources: located.service-sources

return { improvements: result.improvements }
```

---

## locator

Find and read the system source files. Validate that the source path contains a valid OpenProse system.

### Parameters

- source-path: path to the system's source directory
- inspection: the inspection run binding

### Returns

- root-source: the root source file content (the root `*.prose.md` contract file)
- service-sources: map of service name to file content for each service in the system
- inspection-output: the inspection report extracted from the inspection run's bindings

### Errors

- source-not-found: source-path does not exist or contains no root contract source file
- inspection-invalid: cannot find or parse the inspection output from the run

### Strategies

- look for the root source by scanning `*.prose.md` files for the root contract in frontmatter
- resolve service files relative to the root source file's directory
- read the inspection output from the run's bindings directory

---

## analyst

Examine the system source against the inspection findings. Identify every improvement opportunity with evidence from both sources.

### Parameters

- root-source: root source content from locator
- service-sources: service file contents from locator
- inspection-output: inspection report from locator

### Returns

- analysis: list of improvement opportunities, each with category, description, evidence, affected file, and estimated impact
- each opportunity has: a reference to the specific inspection finding that motivates it AND a reference to the specific source location that needs changing

### Strategies

- check contract quality: are maintains clauses specific and evaluable? are requires clauses typed clearly? are error conditions declared for plausible failure modes?
- check strategy coverage: does every service that could fail have relevant strategies? do strategies reference concrete conditions, not vague heuristics?
- check shape consistency: do shape.self lists match what the contract actually does? do shape.delegates match the `call` targets in `### Execution`? are shape.prohibited entries respected in the contract body?
- check structural efficiency: are independent sub-units wired for parallel execution? are there sub-units that could be merged or split?
- check error handling: does the system have conditional returns for each declared error? are degradation paths specified?
- when the inspection shows a "pass" verdict: still look for improvements — a passing system can still have quality issues
- when the inspection shows a "fail" verdict: prioritize the root cause of failure above all other improvements

---

## implementer

Transform analysis results into concrete diffs. Each diff must be minimal, correct, and independently applicable.

### Parameters

- analysis: improvement opportunities from analyst
- root-source: root source content from locator
- service-sources: service file contents from locator

### Returns

- improvements: the final ranked list matching the function's top-level returns schema, with diffs generated for each opportunity

### Strategies

- when generating diffs: use unified diff format with enough context lines (3+) to unambiguously locate the change
- when multiple improvements affect the same file: ensure diffs are independently applicable (no conflicts if applied in isolation)
- when a change affects the contract surface (requires/maintains): flag as "medium" risk since downstream consumers may depend on the current contract
- when a change only affects strategies or internal service content: flag as "low" risk
- when proposing new services or removing existing ones: flag as "high" risk
