---
name: grill-plan
kind: function
version: 0.15.0
---

# Grill Plan

### Description

Apply the local Matt Pocock `grill-with-docs` skill to challenge the
feature brief and surface the decision tree. Pocock's grilling is
interactive by design ("ask the questions one at a time, waiting for
feedback on each question"); in this auto-pocock pipeline, this service
recommends answers grounded in repository evidence rather than asking the
user. Decision-making is split out into `decide-plan` as a separate
service so the recommend-vs-decide boundary is explicit.

### Parameters

- `feature-brief`: initial feature idea to challenge and clarify
- `domain-doc-layout`: where the domain glossary lives in this repo

### Returns

- `grill-brief`: focused challenge report with questions, why they matter,
  recommended answers, risks, terminology corrections, and unresolved
  unknowns
- `decision-records`: numbered list of
  `{question, recommended_answer, confidence, source, residual_risk}`
  where `source` is one of `brief`, `repo`, or `unresolved`
- `terminology-glossary`: resolved domain terms with avoid-aliases,
  conflicts flagged against the existing glossary, ready to write back to
  the domain-glossary file named in `domain-doc-layout`

### Skills

- grill-with-docs

### Shape

- `self`: challenge the plan, inspect the repository for discoverable
  answers, recommend answers, and identify unresolved questions
- `prohibited`: making final product or implementation decisions, opening
  GitHub Issues, or writing into the issue-tracker location (that is
  `produce-issues`' job)

### Strategies

- Convert every would-be user question into a `decision-records` entry with a
  recommended answer, confidence, source, and residual risk. Note: the
  named-evidence shape (`decision-records` as a structured binding) is an
  OpenProse harness adaptation; `grill-with-docs/SKILL.md` describes the
  output in prose, not as a typed record.
- If a question can be answered from the repository, mark `source: repo`
  and cite the file; otherwise mark `source: brief` or `source: unresolved`.
- Use the existing domain glossary in `domain-doc-layout` as the starting
  vocabulary; flag drift instead of inventing terms, per
  `grill-with-docs/CONTEXT-FORMAT.md`.
- Offer an ADR only when the decision is hard-to-reverse AND surprising
  AND a real trade-off, per `grill-with-docs/ADR-FORMAT.md`; otherwise
  omit ADR scope.
- When a term is resolved, capture the resolution in
  `terminology-glossary` so `decide-plan` can commit it to the live
  glossary, mirroring Pocock's `grill-with-docs/SKILL.md` rule —
  *"update CONTEXT.md right there. Don't batch these up."* — applied
  at the service boundary.
