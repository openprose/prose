---
name: ratchet
kind: pattern
---

# Ratchet

Advancer proposes steps, certifier validates. Certified progress is never rolled back.

### Description

Advancer proposes incremental steps; certifier validates each one; certified progress is never rolled back.

### Metadata

- `version`: 0.1.0

### Slots

- `advancer` (primary)
  - requires: task_brief, certified_progress, rejection feedback (if prior rejection)
  - ensures: proposed next step
- `certifier`
  - requires: task_brief, certified_progress, proposed step
  - ensures: certify or reject verdict

### Config

- `max_steps` (integer, default: 5): Maximum advancement attempts

### Invariants

- Progress is monotonic — the certified_progress array only grows, never shrinks
- The advancer does not know a certifier will evaluate its proposals
- The certifier does not know its verdicts drive a retry loop
- Rejected steps are discarded, never appended to certified progress

### Shape

- `self`: manage the advance-certify loop, maintain certified progress log
- `delegates`:
  - `advancer`: propose the next incremental step
  - `certifier`: certify or reject the proposed step
- `prohibited`: none

### Requires

- Pattern instance receives:
    advancer: string             -- service or system name for the advancer
    certifier: string            -- service or system name for the certifier
    task_brief: string           -- the overall goal
    max_steps: number            -- (optional, default 5)
    certified_progress: any[]    -- (optional, default []) — prior certified steps

### Delegation

The advancer receives the task brief plus all certified progress so far; the certifier receives the proposed step and decides certify or reject. Certified steps are appended to `certified_progress` and never removed; rejected steps are discarded and the advancer receives the rejection reason to propose differently. Progress is monotonic — the `certified_progress` array only grows. The delegation returns `result`: the final certified progress.

```prose
let certified_progress = certified_progress
let rejection_feedback = null

repeat max_steps:
  let proposal = call advancer
    task_brief: task_brief
    certified_progress: certified_progress
    rejection_feedback: rejection_feedback

  let verdict = call certifier
    task_brief: task_brief
    certified_progress: certified_progress
    proposed_step: proposal

  if verdict certifies the proposal:
    append proposal to certified_progress
    rejection_feedback = null
  else:
    rejection_feedback = verdict

return {
  result: certified_progress
}
```

### Notes

The advancer does not know a certifier will evaluate its proposals. The certifier does not know its verdicts drive a retry loop. The structural guarantee is monotonic progress — once a step is certified, it is committed. This is valuable when rollback is expensive or when partial progress must be preserved across failures.
