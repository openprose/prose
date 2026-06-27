---
name: context-brief
kind: responsibility
version: 0.15.0
---

# Context Brief

Maintain a short brief for the latest request while keeping the distinction
between declared context and runtime truth visible.

### Requires

- `request`: the staged request payload maintained by `request-inbox`.

### Context

- Source of truth: read the triggered request payload from `request-inbox` on facet `request`.
- Treat this section as read-only grounding; do not invent a request id, source revision, or user goal.
- Context can explain how to interpret the request, but it does not satisfy the `request` requirement.

### Maintains

- `brief`: a concise, auditable brief for the current request.

#### brief

Material: request id, source revision, request goal, and a short statement of
which declared truth was used.

### Continuity

- input-driven: render when the `request` facet from `request-inbox` moves.

### Execution

- Use `wm_list_upstream` to confirm the available upstream producer/facet pairs.
- Use `wm_read_upstream` to read `request-inbox` on facet `request`.
- Write `state/brief.md` with the request id, source revision, goal, and a note
  that the brief used declared Context plus upstream request truth.
