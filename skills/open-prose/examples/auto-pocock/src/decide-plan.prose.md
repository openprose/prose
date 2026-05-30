---
name: decide-plan
kind: function
---

# Decide Plan

### Description

Turn the griller's challenge report into a decision-ready plan and lock
the terminology the rest of the run must use verbatim. This service is an
OpenProse adaptation — Pocock's `grill-with-docs` resolves decisions
inline within the same interactive session and does not have a separate
"decider" step. The split exists here only because the grilling service
is non-interactive; the decider service stands in for the human
judgment Pocock's flow normally provides.

### Parameters

- `feature-brief`: original feature brief
- `grill-brief`: challenge report from `grill-plan`
- `decision-records`: numbered decision log from `grill-plan`
- `terminology-glossary`: drafted glossary from `grill-plan`

### Returns

- `grilled-plan`: clarified decisions, terminology, risks, and open
  questions ready for PRD generation
- `chosen-terminology`: final glossary that PRD, issues, implementation,
  and review must use verbatim
- `open-questions`: questions intentionally left unresolved, each with the
  exact plan risk the unresolved question creates

### Shape

- `self`: make final planning decisions from the original brief,
  repository evidence, and the griller's recommendations
- `prohibited`: reopening a live user interview, hiding unresolved
  questions, inventing evidence, or introducing new domain terms beyond
  `terminology-glossary`

### Invariants

- Decisions never silently drop a `decision-records` entry; unanswered ones
  must appear in `open-questions` with explicit residual risk.

### Strategies

- Prefer the griller's recommended answer when it is grounded in
  repository evidence or the original brief.
- When the griller identifies unresolved ambiguity, choose a conservative
  v1 decision and record the residual risk in `open-questions`.
- Lock `chosen-terminology` before drafting the plan; do not coin new
  domain terms here.
