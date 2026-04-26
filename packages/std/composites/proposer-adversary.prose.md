---
name: proposer-adversary
kind: composite
---

# Proposer-Adversary

One role proposes, another attacks, and the unresolved tension is returned for
the parent to judge.

### Requires

- `composite_state`: Json<ProposerAdversaryState> - proposer, adversary, task brief, and attack criteria

### Ensures

- `composite_result`: Json<ProposerAdversaryResult> - proposal, attack, unresolved risks, and parent handoff notes

### Effects

- `pure`: deterministic topology pattern over declared state

### Execution

```prose
Give the proposer only the task brief.
Give the adversary the proposal and original task.
Ask the adversary to identify flaws, edge cases, and counterexamples.
Do not resolve the disagreement inside this composite.
Return proposal and attack for the parent.
```
