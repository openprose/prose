---
name: bug-hunter
kind: program
---

### Services

- `detective`
- `surgeon`

### Requires

- `bug-report`: error message, stack trace, or bug description

### Ensures

- `report`: investigation report with root cause, fix applied, tests added, and lessons learned

### Execution

```prose
# Phase 1: Evidence gathering (parallel)
let error-analysis = call detective
  task: "analyze bug report and extract error details"
  bug-report: bug-report

let code-context = call detective
  task: "search codebase for related files and recent changes"
  bug-report: bug-report

# Phase 2: Diagnosis
let hypotheses = call detective
  task: "form hypotheses ranked by likelihood"
  error-analysis: error-analysis
  code-context: code-context

# Phase 3: Hypothesis testing
loop until root cause confirmed (max: 5):
  let test-result = call detective
    task: "test the most likely hypothesis"
    hypotheses: hypotheses
    code-context: code-context

  if hypothesis confirmed:
    let diagnosis = call detective
      task: "document root cause"
      test-result: test-result

  if hypothesis disproven:
    let hypotheses = call detective
      task: "re-rank hypotheses based on new evidence"
      test-result: test-result

# Phase 4: Fix
call surgeon
  diagnosis: diagnosis
  code-context: code-context

# Phase 5: Verify
loop until all tests pass (max: 3):
  let verification = call detective
    task: "verify fix and run tests"
  if failures:
    call surgeon
      task: "adjust fix based on test results"
      verification: verification

# Phase 6: Report
let report = call detective
  task: "final investigation report with lessons learned"
  diagnosis: diagnosis

return report
```
