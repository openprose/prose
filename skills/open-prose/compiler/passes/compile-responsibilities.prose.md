---
name: compile-responsibilities
kind: service
---

# Compile Responsibilities

Lower `kind: responsibility` source into semantic responsibility records,
concrete trigger registrations, and activation intent records.

### Requires

- `sources`: discovered source records.
- `source_root`: source directory containing the source graph.

### Ensures

- `responsibilities`: records preserving `Goal`, `Continuity`, `Criteria`,
  `Constraints`, and optional `Fulfillment`.
- `triggers`: concrete cron/manual trigger records inferred from
  `Continuity` when cadence is clear.
- `activations`: judge and fulfillment activation intent.
- `diagnostics`: errors for missing core sections and warnings for ambiguous
  timing or fulfillment.

### Strategies

- Load `../../concepts/responsibility.md` before compiling responsibility
  source.
- Require `Goal`, `Continuity`, `Criteria`, and `Constraints`.
- Preserve responsibility text as author intent. Do not rewrite it into
  implementation steps.
- Treat `Fulfillment` as an optional hint. Resolve it to a discovered system or
  service only when the target is clear.
- When `Fulfillment` is omitted, infer from nearby systems, service names,
  source paths, and contracts only when one relationship is clearly strongest.
- Infer concrete trigger registrations from temporal language in `Continuity`
  when cadence is clear enough for a standard five-field cron expression.
- Emit a diagnostic instead of guessing when cadence is ambiguous.
- Do not invent provider-specific webhook routes, queue names, auth, or payload
  schemas from responsibility text alone.
- Emit one judge activation for each responsibility.
- Emit fulfillment activation intent only when a declared or inferred
  fulfillment target is clear.
- Prefer diagnostics over silent assumptions when fulfillment or timing is
  ambiguous.
