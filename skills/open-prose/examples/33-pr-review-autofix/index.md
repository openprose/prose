---
name: pr-review-autofix
kind: program
services: [reviewer, security-reviewer, fixer, captain]
---

requires:
- pr: the pull request to review and fix

ensures:
- report: final PR review report with issues found, issues fixed, and MERGE/NEEDS_ATTENTION/BLOCK recommendation

### Execution

# Phase 1: Parallel multi-perspective review
let general-review = call reviewer
  pr: pr

let security-review = call security-reviewer
  pr: pr

# Phase 2: Synthesize and prioritize
let issues = call captain
  task: "synthesize reviews into prioritized issue list"
  general-review: general-review
  security-review: security-review

# Phase 3: Auto-fix loop
loop until all issues resolved or unfixable (max: 10):
  if no remaining issues:
    let report = call captain
      task: "summarize what was fixed"
    return report

  let current-issue = call captain
    task: "select next highest priority issue"
    issues: issues

  let fix-result = call fixer
    issue: current-issue

  call captain
    task: "update issue tracking"
    issue: current-issue
    fix-result: fix-result

# Phase 4: Final verification
let final-review = call reviewer
  task: "final review pass verifying all fixes"

let report = call captain
  task: "generate final report with recommendation"
  final-review: final-review

return report
