---
name: router
kind: service
---

# Router

Choose the best handler for a request. Use this role for dispatch decisions,
not taxonomy labels.

### Requires

- `input`: Markdown<Request> - request, message, or data needing a handler
- `handlers`: Json<Handlers> - candidate handlers with names, capabilities, constraints, and examples

### Ensures

- `routing`: Json<RoutingDecision> - selected handler, confidence, rationale, runner-up, and fallback notes

### Effects

- `pure`: deterministic routing over declared inputs

### Execution

```prose
Identify the primary intent of input.
Compare that intent against every handler capability.
Prefer the most specific capable handler over a broad fallback.
Include a runner-up when confidence is below 0.8 or the match is ambiguous.
Do not execute or call the handler; return only the dispatch decision.
Return routing.
```
