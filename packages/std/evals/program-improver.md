---
name: program-improver
kind: program
---

# Program Improver

Given an inspection report and the inspected program's source, analyze the program for improvement opportunities and produce ranked proposals with diffs. This program operates on Prose v1 programs (.md format) and understands the full contract surface: requires, ensures, errors, invariants, strategies, environment, and shapes.

### Services

- locator
- analyst
- implementer

### Requires

- inspection: run — a completed inspector run whose output identifies issues with a program
- source-path: path to the program's source directory (the .md files)

### Ensures

- improvements: ranked list of improvement opportunities, each containing:
    - rank: priority position (1 = highest impact)
    - category: one of "contract" (ensures/requires quality), "strategy" (missing or vague strategies), "shape" (delegation boundary violations), "structure" (service decomposition issues), "error-handling" (missing error declarations or conditional ensures), "efficiency" (unnecessary services or missing parallelization)
    - description: what the problem is
    - evidence: specific reference to inspection findings and program source
    - diff: proposed change as a unified diff against the source file
    - risk: "low" (safe refactor), "medium" (changes contract surface), or "high" (changes program behavior)
- if no improvements found: empty list with explanation of why the program is sound

### Errors

- source-not-found: the source-path does not contain valid Prose program files
- inspection-invalid: the inspection run output is not a valid inspector report

### Strategies

- when analyzing contracts: check that every ensures clause is specific enough to evaluate — vague ensures like "a good report" are improvement targets
- when analyzing strategies: check that strategies cover the program's known failure modes — if the inspection shows failures, the program should have strategies to handle them
- when analyzing shapes: verify that services with shape.delegates actually delegate (not collapse), and services with shape.prohibited do not violate boundaries
- when proposing diffs: make minimal changes — one concern per diff. Never rewrite a program wholesale.
- when ranking: prioritize contract violations and missing error handling over efficiency improvements

---

## locator

Find and read the program source files. Validate that the source path contains a valid Prose program.

### Requires

- source-path: path to the program's source directory
- inspection: the inspection run binding

### Ensures

- program-source: the entry point file content (the file with `kind: program`)
- service-sources: map of service name to file content for each service in the program
- inspection-output: the inspection report extracted from the inspection run's bindings

### Errors

- source-not-found: source-path does not exist or contains no `kind: program` file
- inspection-invalid: cannot find or parse the inspection output from the run

### Strategies

- look for the entry point by scanning .md files for `kind: program` in frontmatter
- resolve service files relative to the entry point's directory
- read the inspection output from the run's bindings directory

---

## analyst

Examine the program source against the inspection findings. Identify every improvement opportunity with evidence from both sources.

### Requires

- program-source: entry point content from locator
- service-sources: service file contents from locator
- inspection-output: inspection report from locator

### Ensures

- analysis: list of improvement opportunities, each with category, description, evidence, affected file, and estimated impact
- each opportunity has: a reference to the specific inspection finding that motivates it AND a reference to the specific source location that needs changing

### Strategies

- check contract quality: are ensures clauses specific and evaluable? are requires clauses typed clearly? are error conditions declared for plausible failure modes?
- check strategy coverage: does every service that could fail have relevant strategies? do strategies reference concrete conditions, not vague heuristics?
- check shape consistency: do shape.self lists match what the service actually does? do shape.delegates match the services list? are shape.prohibited entries respected in the service body?
- check structural efficiency: are independent services wired for parallel execution? are there services that could be merged or split?
- check error handling: does the program have conditional ensures for each declared error? are degradation paths specified?
- when the inspection shows a "pass" verdict: still look for improvements — a passing program can still have quality issues
- when the inspection shows a "fail" verdict: prioritize the root cause of failure above all other improvements

---

## implementer

Transform analysis results into concrete diffs. Each diff must be minimal, correct, and independently applicable.

### Requires

- analysis: improvement opportunities from analyst
- program-source: entry point content from locator
- service-sources: service file contents from locator

### Ensures

- improvements: the final ranked list matching the program's top-level ensures schema, with diffs generated for each opportunity

### Strategies

- when generating diffs: use unified diff format with enough context lines (3+) to unambiguously locate the change
- when multiple improvements affect the same file: ensure diffs are independently applicable (no conflicts if applied in isolation)
- when a change affects the contract surface (requires/ensures): flag as "medium" risk since downstream consumers may depend on the current contract
- when a change only affects strategies or internal service content: flag as "low" risk
- when proposing new services or removing existing ones: flag as "high" risk
