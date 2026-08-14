---
name: synthesize-brief
kind: function
version: 0.15.0
---

# Synthesize Brief

> A stateless helper the `grill` responsibility calls to turn the challenge
> report into a decision-ready plan. A `function` declares `### Parameters ->
> ### Returns`, has no world-model, and no wake source — it is ephemeral and
> pure.

### Parameters

- `challenge-report`: focused challenge report with questions, recommended
  answers, risks, terminology corrections, and unresolved unknowns.
- `decision-records`: numbered list of `{question, recommended_answer,
  confidence, source, residual_risk}`.
- `terminology-glossary`: resolved domain terms with avoid-aliases.

### Returns

The synthesized plan, as a stateless value:

- `grilled-plan`: clarified decisions, terminology, risks, and open questions
  ready for downstream consumption.
- `chosen-terminology`: final glossary that downstream services must use verbatim.
- `open-questions`: questions intentionally left unresolved, each with the exact
  plan risk the unresolved question creates.

### Shape

- `self`: synthesize the grilling output into a decision-ready artifact
- `prohibited`: making final product decisions, reopening a live user interview,
  inventing evidence, or introducing new domain terms beyond `terminology-glossary`

### Invariants

- Decisions never silently drop a `decision-records` entry; unanswered ones
  must appear in `open-questions` with explicit residual risk.

### Strategies

- Prefer the griller's recommended answer when it is grounded in repository
  evidence or the original brief.
- Lock `chosen-terminology` before drafting the plan; do not coin new domain
  terms here.
