---
name: program-improver
kind: program
services: [locator, analyst, implementer, pr-author]
---

requires:
- inspection: run
- subject: run

ensures:
- result: PR or proposal with improved program source
- if no improvements needed: clean status with explanation of why the program is already well-optimized
- if source repo accessible: PR created with changes and rationale
- if source repo not accessible: proposal file written with recommended changes

errors:
- no-improvements: inspection shows no program-level issues (this is a success case, not a failure)
- source-not-found: cannot locate the original program source files from the run artifacts

strategies:
- focus on program-level improvements only: contract clarity, service decomposition, strategy effectiveness, error handling coverage. VM-level issues belong to vm-improver.
- when multiple improvements are possible: group related changes into a single coherent PR rather than many small ones
- preserve the author's intent: improve contracts and strategies without changing what the program fundamentally does
- when inspection scores are mixed: prioritize fixes for dimensions that scored below 5/10

invariants:
- every proposed change references the specific inspection finding that motivated it
- the improved program passes the same contracts as the original (ensures are preserved or strengthened, never weakened)
- PR descriptions explain both what changed and why

---

## locator

requires:
- subject: run

ensures:
- sources: paths to the original program entry point and service files, identified from the run's program.md and services/ directory, with repo root path if inside a git repository

errors:
- source-not-found: cannot locate the original program source files

strategies:
- check run directory for program.md (copy of entry point) and services/ directory
- trace back to original file paths from the manifest
- detect if the source is inside a git repo (needed for PR creation)

---

## analyst

requires:
- inspection: run
- sources: original program source file paths

ensures:
- improvements: prioritized list of specific improvements, each with: the inspection finding it addresses, the affected file and section, the proposed change (in natural language), and expected impact on inspection scores

errors:
- no-improvements: inspection shows no program-level issues

strategies:
- parse the inspection run's verdict JSON to identify low-scoring dimensions
- map each finding to a specific part of the program source (frontmatter, requires, ensures, strategies, service definitions)
- distinguish between contract improvements (clearer requires/ensures), structural improvements (better service decomposition), and behavioral improvements (better strategies/error handling)

---

## implementer

requires:
- improvements: prioritized list of proposed improvements
- sources: original program source file paths

ensures:
- changes: the actual modified program files with improvements applied, plus a diff summary showing what changed in each file

strategies:
- apply improvements in priority order
- validate that modified files are still valid Prose v2 format
- keep changes minimal and focused -- do not refactor beyond what the improvements require
- preserve all existing ensures contracts (strengthen but never weaken)

---

## pr-author

requires:
- changes: modified program files with diff summary
- sources: original source paths with repo information

ensures:
- result: if git repo detected, a PR with the changes, clear title, and description linking to the inspection findings. If no git repo, a proposal file containing the changes and rationale.

strategies:
- PR title format: "improve(program-name): [brief description of main change]"
- PR body: summary of changes, link to inspection findings, expected impact on future inspection scores
- if creating a proposal file: write to .prose/proposals/{program-name}-{timestamp}.md
