---
name: dialectic
kind: pattern
---

# Dialectic

Thesis and antithesis argue positions. Disagreement IS the output.

### Description

Thesis and antithesis argue opposing positions; the unresolved tension is the output.

### Metadata

- `version`: 0.1.0

### Slots

- `thesis`
  - requires: task_brief, prior antithesis argument (if not first round)
  - ensures: argument for the position
- `antithesis`
  - requires: task_brief, prior thesis argument
  - ensures: argument against the position

### Config

- `rounds` (integer, default: 2): Number of exchange rounds

### Invariants

- Neither service knows it is part of a dialectic
- The full exchange is the output — the pattern never resolves the tension
- Each service sees only the other's prior argument, not its reasoning

### Shape

- `self`: manage argument rounds, pass each service the other's prior argument
- `delegates`:
  - `thesis`: argue for a position
  - `antithesis`: argue against it
- `prohibited`: none

### Parameters

- Pattern instance receives:
    thesis: string        -- function or responsibility name for thesis service
    antithesis: string    -- function or responsibility name for antithesis service
    task_brief: string    -- the question or proposition to argue
    rounds: number        -- (optional, default 2)

### Returns

- Round 1: thesis argues first, antithesis responds
- Subsequent rounds: each service sees the other's prior argument
- This pattern does NOT resolve the tension — the full exchange is the output
- The instantiating system extracts insight from the tension
- `result`: the full exchange
- `exchange`: structured round-by-round arguments

### Delegation

```prose
let exchange = []
let last_thesis = null
let last_antithesis = null

repeat rounds as round:
  let last_thesis = call thesis
    task_brief: task_brief
    prior_antithesis: last_antithesis
    prompt: "Argue for the position, responding to the prior counterargument if present."

  let last_antithesis = call antithesis
    task_brief: task_brief
    prior_thesis: last_thesis
    prompt: "Argue against the position, directly countering the thesis argument."

  record { round: round, thesis: last_thesis, antithesis: last_antithesis } in exchange

return {
  result: exchange,
  exchange: exchange
}
```

### Notes

This is a seed pattern. Neither service knows it is part of a dialectic. Each receives a brief asking it to argue a position. The structural value is in the tension between positions — premature consensus is more dangerous than unresolved disagreement.
