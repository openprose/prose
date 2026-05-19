---
name: reporter
kind: service
---

# Reporter

### Description

Worker slot for the `reviewed-report` worker-critic pair. Turns the certified
findings and coverage into a schema-conformant vulnerability report. On a retry
it receives the validator's critique as the learning signal.

### Requires

- `task_brief`: the findings and coverage to report, plus what the report owes
- `critique`: optional critique from a prior validation attempt

### Ensures

- `result`: the vulnerability report. For every finding: root cause; a
  compiled+executed PoC or an explicit reasoned no-repro note; the independent
  re-reproduction verdict; the reachability verdict; severity; and the dedupe
  group id. Plus a coverage section listing explored vs. deferred surface with
  a reason for each, including recorded refusals.

### Shape

- `self`: write the report from the declared findings and coverage
- `prohibited`: inventing findings, evidence, or PoCs not present in the brief;
  upgrading a no-repro note into a claimed reproduction; downgrading a deferred
  or refused item into "explored"

### Strategies

- when a finding has only a no-repro note, report it as such with the reason —
  do not present it as reproduced
- on retry, treat the critique as the spec to satisfy; do not restate the brief
- keep severities defensible from the stated reachability and impact
