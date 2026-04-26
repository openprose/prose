---
name: fallback-chain
kind: composite
---

# Fallback Chain

Try candidates sequentially in preference order until one succeeds.

### Requires

- `control_state`: Json<FallbackChainControlState> - ordered chain, task brief, and failure criteria

### Ensures

- `control_result`: Json<FallbackChainControlResult> - winner, result, attempts, and failure history

### Effects

- `pure`: deterministic coordination pattern over declared state

### Execution

```prose
Validate that chain is non-empty.
Try candidates in declared order.
Give every candidate the original task brief, not prior failure context.
Stop immediately on the first successful result.
If all candidates fail, return null result with complete failure history.
Return control_result.
```
