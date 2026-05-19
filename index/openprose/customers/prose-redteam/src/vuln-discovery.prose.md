---
name: vuln-discovery
kind: system
---

# Vulnerability Discovery

### Description

Adversarial, multi-round security review of a target codebase. Recon scopes
the attack surface into narrow tasks; many hunters work those tasks in
parallel; an independent disprover confirms-by-reproduction or refutes each
candidate; findings are root-cause deduplicated and traced for reachability; a
monotonic coverage ledger persists what has been certified across rounds and
runs; gap-fill turns under-explored or refused surface into the next round's
task queue. The final report is produced by a worker-critic pair that fails
closed on any non-conformant report.

### Services

```yaml
- recon
- hunt-agent
- disprove
- dedupe
- trace
- trace-merge
- coverage-ledger
- gapfill
- name: reviewed-report
  pattern: std/patterns/worker-critic
  with:
    worker: reporter
    critic: schema-validator
  config:
    max_rounds: 3
```

### Requires

- `repo_path`: local path to the target repository
- `attack_surface`: security boundaries and vulnerability classes in scope
- `consumer_repos`: optional repos consuming this code, for reachability
- `prior_run`: run — optional prior `vuln-discovery` run to resume coverage from
- `round_budget`: max hunt→disprove→dedupe→trace→gapfill rounds. Default 4.

### Ensures

- `report`: schema-validated vulnerability report
- each finding has: a root cause; a compiled, executed PoC OR an explicit
  reasoned no-repro note; an independent re-reproduction verdict; a
  reachability verdict; a severity; and a dedupe group id
- `coverage`: surface explored vs. deferred, each entry with a reason
- a legitimate task that a hunter refuses is recorded in `coverage` with the
  refusal text — it is never silently dropped

### Errors

- `unbuildable`: the target repo cannot be built, so no PoC can be compiled
- `schema_invalid`: the report could not be made schema-conformant in budget

### Invariants

- `disprove` and `trace` never see a hunter's internal reasoning — only
  declared findings cross the bindings boundary.
- No finding reaches the report without a recorded reproduction OR an explicit
  reasoned no-repro note.
- Certified coverage is monotonic: it only grows, across rounds and runs.
- The run never scans outside `repo_path`, never runs a PoC against an
  external or live system, and never edits the target repository.

### Execution

```prose
let recon = call recon
  repo_path: repo_path
  attack_surface: attack_surface

let ledger = call coverage-ledger
  prior_run: prior_run
  recon: recon

let task_queue = recon.task_queue

loop until coverage is sufficient or a round surfaces no new reachable findings (max: round_budget) as round:
  let candidates = parallel for task in task_queue:
    call hunt-agent
      task: task
      shared_context: recon.shared_context

  let validated = parallel for candidate in candidates:
    call disprove
      finding: candidate.finding
      poc: candidate.poc

  let deduped = call dedupe
    findings: validated

  let traced = parallel for finding in deduped.findings:
    call trace
      finding: finding
      consumer_repos: consumer_repos

  let reachability = call trace-merge
    traced: traced

  ledger = call coverage-ledger
    recon: recon
    reachability: reachability
    candidates: candidates
    round: round

  task_queue = call gapfill
    attack_surface: attack_surface
    ledger: ledger

let reviewed = call reviewed-report
  task_brief: """
  Produce the vulnerability report from the certified findings and coverage.
  Findings: {ledger.findings}
  Coverage: {ledger.coverage}
  """
  criteria: """
  The report must be schema-conformant: every finding carries a root cause, a
  compiled+executed PoC or an explicit reasoned no-repro note, an independent
  re-reproduction verdict, a reachability verdict, a severity, and a dedupe
  group id. Coverage lists explored vs. deferred surface with a reason for
  each, including any recorded refusals. Reject any report that ships a
  finding lacking reproduction evidence or a reasoned no-repro note.
  """

return reviewed.result
```
