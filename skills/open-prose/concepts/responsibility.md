---
role: responsibility-semantics
summary: |
  Semantic contract for `kind: responsibility` files. A responsibility is a
  goal that must remain true over time. Read this file when authoring,
  reviewing, or compiling responsibility-oriented OpenProse source.
see-also:
  - ../responsibility-runtime.md: Responsibility Runtime stack and layer boundaries
  - reactor.md: Evented reconciliation and maintenance pressure
  - ../forme.md: Fulfillment wiring semantics
  - ../contract-markdown.md: Markdown source format
---

# Responsibility

A goal is a point-in-time requirement.

A responsibility is a standing goal: a goal that must remain true over time.

Responsibilities are the top-level semantic unit of Responsibility-Oriented
Architecture. They define standing obligations, not implementation machinery.

## Canonical Shape

```markdown
---
name: high-intent-stargazers
kind: responsibility
---

### Goal

High-intent GitHub stargazers are identified, enriched, and thoughtfully
followed up with.

### Continuity

- Check often enough that new high-intent stargazers are not left unattended
  for more than one business day.
- Preserve enough history to avoid duplicate outreach.
- Revisit stale leads when new evidence changes their fit.

### Criteria

- Stargazers are qualified with evidence from GitHub, company context, and
  likely operational pain.
- Proposed OpenProse programs are specific to the prospect's observed work.
- Outreach includes sample results when useful.

### Constraints

- Do not send embarrassing, generic, or clearly irrelevant outreach.
- Do not contact the same person repeatedly without new evidence.
- Keep enrichment and outreach costs bounded.

### Fulfillment

Prefer the local `stargazer-outreach` system when present.
```

## Sections

| Section | Meaning |
|---------|---------|
| `Goal` | The invariant: what must remain true |
| `Continuity` | How time qualifies the obligation |
| `Criteria` | What counts as satisfactory fulfillment |
| `Constraints` | What must remain bounded or prohibited |
| `Fulfillment` | Optional hint naming source that may fulfill the responsibility |

`Goal`, `Continuity`, `Criteria`, and `Constraints` are the core contract.
`Fulfillment` is optional. If omitted, the compiler should infer fulfillment
from nearby systems, services, names, and contracts when the relationship is
clear.

## What Belongs Here

Put obligations here:

- the outcome that must remain true
- freshness or recurrence expectations
- evidence and quality bars
- safety, cost, and repetition boundaries
- optional fulfillment hints

Keep implementation details out:

- concrete cron syntax
- webhook routes
- queue names
- step-by-step behavior
- test cases
- storage schema

Concrete connector details belong in optional `kind: gateway` source when
inference cannot safely recover them. Tests belong in the parallel test system.

## Compiler Expectations

When compiling a responsibility, the VM should infer:

- the responsibility record from the four core sections
- concrete triggers from `Continuity` when cadence is clear
- standard cron cadence from how quickly drift must be noticed
- fulfillment source from `Fulfillment` or clear source-graph evidence
- activation intent for judge, fulfillment, retry, or escalation
- diagnostics when fulfillment, timing, or criteria are ambiguous

The compiler should not invent provider-specific routes, queues, or webhook
payload shapes when the source does not supply enough evidence.

## Health Question

The derived judge asks:

- Is the goal currently true?
- Are continuity requirements being met?
- Are criteria satisfied?
- Are constraints violated?
- What evidence supports the status?
- What maintenance feedback should be produced?

No user-authored judge file is required for the first version. The bundled
`runtime/judge-responsibility.prose.md` service judges from the compiled
responsibility itself.
