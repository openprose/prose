---
name: dialectic
kind: composite
---

# Dialectic

Alternate thesis and antithesis roles across rounds to expose unresolved
tensions before synthesis.

### Requires

- `composite_state`: Json<DialecticState> - thesis role, antithesis role, task brief, and round count

### Ensures

- `composite_result`: Json<DialecticResult> - exchange history, stable agreements, open tensions, and synthesis prompt

### Effects

- `pure`: deterministic topology pattern over declared state

### Execution

```prose
Ask thesis to argue for the position.
Ask antithesis to respond against the position and thesis argument.
Repeat for the requested number of rounds, carrying prior counterarguments forward.
Preserve disagreement when it remains unresolved.
Return the exchange and tension map.
```
