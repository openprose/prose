---
name: language-self-improvement
kind: program
---

### Services

- `archaeologist`
- `clinician`
- `architect`
- `spec-writer`
- `guardian`
- `test-smith`

### Requires

- `corpus-path`: path to .prose files to analyze (default: examples/)
- `conversations`: conversation threads where people struggled with the language (optional)
- `focus`: specific area to focus on, e.g., "error handling", "parallelism" (optional)

### Ensures

- `evolution`: language improvement proposals with spec patches, test files, risk assessment, and migration guide

### Execution

```prose
# Phase 1: Corpus excavation (parallel)
let patterns = call archaeologist
  corpus: corpus-path
  task: "find recurring patterns with frequency counts, distinguish idioms from workarounds"

let pain-points = call clinician
  corpus: corpus-path
  conversations: conversations
  task: "identify confusion, errors, and gaps between intent and expression"

let current-spec = call archaeologist
  corpus: "contract-markdown.md, prosescript.md, forme.md, prose.md"
  task: "summarize current language capabilities and inconsistencies"

# Phase 2: Synthesis
let synthesis = call architect
  patterns: patterns
  pain-points: pain-points
  current-spec: current-spec
  focus: focus
  task: "rank potential improvements by (frequency x severity) / complexity"

# Phase 3: Proposals
let proposals = call architect
  synthesis: synthesis
  task: "produce detailed proposals for top 3-5 candidates with syntax, semantics, and before/after"

# Phase 4: Spec drafting (for approved proposals)
let spec-patches = call spec-writer
  proposals: proposals
  current-spec: current-spec
  task: "write specification additions following the OpenProse reference style"

# Phase 5: Test creation
let test-files = call test-smith
  proposals: proposals
  task: "create test files exercising happy path, edge cases, and interactions"

# Phase 6: Risk assessment
let risks = call guardian
  proposals: proposals
  spec-patches: spec-patches
  current-spec: current-spec
  task: "assess breaking level (0-3), complexity cost, interaction risks, implementation effort"

# Phase 7: Migration guide
let migration = call spec-writer
  proposals: proposals
  risks: risks
  corpus-path: corpus-path
  task: "write migration guide with before/after examples and version recommendation"

let evolution = call architect
  task: "package final language evolution proposal"
  proposals: proposals
  spec-patches: spec-patches
  test-files: test-files
  risks: risks
  migration: migration

return evolution
```
