---
name: compile-responsibilities
kind: service
---

# Compile Responsibilities

Lower `kind: responsibility` source into semantic responsibility, trigger
intent, and activation intent records.

### Requires

- `sources`: discovered source records.
- `source_root`: repository path containing the source graph.

### Ensures

- `responsibilities`: records preserving `Goal`, `Continuity`, `Criteria`,
  `Constraints`, and optional `Fulfillment`.
- `triggers`: semantic trigger intent inferred from `Continuity`.
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
- Infer trigger intent from temporal language in `Continuity`; emit
  `periodic`, `event`, `manual`, or `unknown` intent, not concrete cron,
  webhook, queue, or provider payload details.
- Emit one judge activation for each responsibility.
- Emit fulfillment activation intent only when a declared or inferred
  fulfillment target is clear.
- Prefer diagnostics over silent assumptions when fulfillment or timing is
  ambiguous.
