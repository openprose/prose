---
name: ratchet
kind: composite
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

- `task_brief` (string, default: none): The goal to advance toward
- `max_steps` (integer, default: 5): Maximum advancement attempts
- `certified_progress` (array, default: none): Prior certified steps to resume from

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

- &compositeState exists at __compositeState with:
    advancer: string             -- component name for the advancer
    certifier: string            -- component name for the certifier
    task_brief: string           -- the overall goal
    max_steps: number            -- (optional, default 5)
    certified_progress: any[]    -- (optional, default []) — prior certified steps

### Ensures

- Advancer receives the task brief plus all certified progress so far
- Certifier receives the proposed step and decides: certify or reject
- Certified steps are appended to &compositeState.certified_progress — never removed
- Rejected steps are discarded — advancer receives the rejection reason and proposes differently
- Progress is monotonic: the certified_progress array only grows
- &compositeState.result contains the final certified progress


### Effects

- `pure`: deterministic transformation over declared inputs

### Delegation Loop

```javascript
const { advancer, certifier, task_brief, max_steps = 5 } = __compositeState;
let certified = __compositeState.certified_progress || [];
let consecutiveRejects = 0;

for (let step = 0; step < max_steps; step++) {
  // Advancer proposes
  let advancerBrief = `Propose the next incremental step toward the goal.\n\nGoal: ${task_brief}\n\nCertified progress so far:\n${certified.length ? certified.map((s, i) => `${i + 1}. ${s}`).join("\n") : "(none yet)"}`;
  if (consecutiveRejects > 0) {
    advancerBrief += `\n\nYour last ${consecutiveRejects} proposal(s) were rejected. Try a different approach.`;
  }

  const proposal = await rlm(advancerBrief, null, { use: advancer });

  // Certifier validates
  const certifierBrief = `Evaluate this proposed step. Does it maintain all invariants? Does it advance toward the goal? Is it consistent with prior certified progress?\n\nGoal: ${task_brief}\nCertified progress: ${JSON.stringify(certified)}\n\nProposed step:\n${proposal}`;
  const verdict = await rlm(certifierBrief, null, { use: certifier });

  const verdictStr = String(verdict).toLowerCase();
  if (/certif|accept|approve/.test(verdictStr)) {
    certified.push(proposal);
    __compositeState.certified_progress = certified;
    consecutiveRejects = 0;
  } else {
    consecutiveRejects++;
  }
}

__compositeState.result = certified;
return(certified);
```

### Notes

The advancer does not know a certifier will evaluate its proposals. The certifier does not know its verdicts drive a retry loop. The structural guarantee is monotonic progress — once a step is certified, it is committed. This is valuable when rollback is expensive or when partial progress must be preserved across failures.
