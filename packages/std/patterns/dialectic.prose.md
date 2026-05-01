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

### Requires

- Pattern instance receives:
    thesis: string        -- service or system name for thesis service
    antithesis: string    -- service or system name for antithesis service
    task_brief: string    -- the question or proposition to argue
    rounds: number        -- (optional, default 2)

### Ensures

- Round 1: thesis argues first, antithesis responds
- Subsequent rounds: each service sees the other's prior argument
- This pattern does NOT resolve the tension — the full exchange is the output
- The instantiating system extracts insight from the tension
- pattern_instance.result contains the full exchange
- pattern_instance.exchange contains the structured round-by-round arguments

### Delegation

```javascript
const { thesis, antithesis, task_brief, rounds = 2 } = pattern_instance;
const exchange = [];

let lastThesis = null;
let lastAntithesis = null;

for (let round = 0; round < rounds; round++) {
  // Thesis argues
  let thesisBrief = round === 0
    ? `Argue FOR the following position.\n\n${task_brief}`
    : `Argue FOR the following position, responding to the counterargument.\n\n${task_brief}\n\nCounterargument from prior round:\n${lastAntithesis}`;
  lastThesis = await rlm(thesisBrief, null, { use: thesis });

  // Antithesis argues
  const antithesisBrief = `Argue AGAINST the following position.\n\n${task_brief}\n\nArgument to counter:\n${lastThesis}`;
  lastAntithesis = await rlm(antithesisBrief, null, { use: antithesis });

  exchange.push({ round: round + 1, thesis: lastThesis, antithesis: lastAntithesis });
}

pattern_instance.result = exchange;
pattern_instance.exchange = exchange;
return(exchange);
```

### Notes

This is a seed pattern. Neither service knows it is part of a dialectic. Each receives a brief asking it to argue a position. The structural value is in the tension between positions — premature consensus is more dangerous than unresolved disagreement.
