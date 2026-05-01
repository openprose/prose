---
name: proposer-adversary
kind: pattern
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

### Requires

- Pattern instance receives:
    proposer: string      -- service or system name for the proposer
    adversary: string     -- service or system name for the adversary
    task_brief: string    -- what to propose

### Ensures

- Proposer receives only the task brief
- Adversary receives the proposal and the task brief — its job is to find flaws,
  edge cases, and counterexamples
- This pattern does NOT resolve the tension
- Returns { proposal, attack } — the instantiating system reasons about the disagreement
- pattern_instance.result contains { proposal, attack }

### Delegation

```javascript
const { proposer, adversary, task_brief } = pattern_instance;

const proposal = await rlm(task_brief, null, { use: proposer });

const adversaryBrief = `Find flaws, edge cases, or counterexamples in this proposal.\n\nOriginal task: ${task_brief}\n\nProposal:\n${proposal}`;
const attack = await rlm(adversaryBrief, null, { use: adversary });

const result = { proposal, attack };
pattern_instance.result = result;
return(result);
```

### Notes

This is a seed pattern. The proposer does not know it will be attacked. The adversary does not know its output will be weighed against the proposal. The instantiating system combines both perspectives and makes the final judgment.
