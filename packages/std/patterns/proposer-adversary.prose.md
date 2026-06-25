---
name: proposer-adversary
kind: pattern
version: 0.15.0
---

# Proposer-Adversary

One proposes, another attacks. The pattern returns both — the instantiating system decides.

### Description

One service proposes, another attacks the proposal, and the unresolved tension is returned for the instantiating system to judge.

### Metadata

- `version`: 0.1.0

### Slots

- `proposer` (primary)
  - requires: task_brief
  - ensures: proposal text
- `adversary`
  - requires: proposal, original task_brief
  - ensures: attack identifying flaws, edge cases, and counterexamples

### Config

- None. The task brief is supplied by the instantiating system.

### Invariants

- The pattern does not resolve the tension — it returns both proposal and attack
- Proposer is unaware it will be attacked
- Adversary is unaware its output will be weighed against the proposal

### Shape

- `self`: delegate to proposer, delegate to adversary, return both outputs
- `delegates`:
  - `proposer`: produce a proposal given the brief
  - `adversary`: find flaws in the proposal
- `prohibited`: none

### Parameters

- Pattern instance receives:
    proposer: string      -- function or responsibility name for the proposer
    adversary: string     -- function or responsibility name for the adversary
    task_brief: string    -- what to propose

### Returns

- `result`: object containing `{ proposal, attack }`.
  The proposer receives only the task brief; the adversary receives the proposal and
  the task brief — its job is to find flaws, edge cases, and counterexamples. The
  pattern does NOT resolve the tension: it returns both `proposal` and `attack` so the
  instantiating system reasons about the disagreement.

### Delegation

```prose
let proposal = call proposer
  task_brief: task_brief

let attack = call adversary
  task_brief: task_brief
  proposal: proposal

return {
  result: {
    proposal: proposal,
    attack: attack
  }
}
```

### Notes

This is a seed pattern. The proposer does not know it will be attacked. The adversary does not know its output will be weighed against the proposal. The instantiating system combines both perspectives and makes the final judgment.
