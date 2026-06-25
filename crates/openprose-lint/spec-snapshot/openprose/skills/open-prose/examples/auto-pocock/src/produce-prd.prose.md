---
name: produce-prd
kind: function
version: 0.15.0
---

# Produce PRD

### Description

Apply the local Matt Pocock `to-prd` skill to the grilled plan and produce
a PRD using `to-prd/SKILL.md`'s seven sections verbatim.

### Parameters

- `grilled-plan`: clarified plan from `decide-plan`
- `chosen-terminology`: glossary from `decide-plan`
- `issue-tracker-convention`: storage location convention so the PRD
  lands where the repo expects it

### Returns

- `prd`: product requirements document with the seven Pocock sections —
  Problem Statement, Solution, User Stories, Implementation Decisions,
  Testing Decisions, Out of Scope, Further Notes — written to the path named in
  `issue-tracker-convention`

### Skills

- to-prd

### Strategies

- Apply the `to-prd/SKILL.md` PRD template verbatim. Section names
  (`Problem Statement`, `Solution`, `User Stories`, `Implementation
  Decisions`, `Testing Decisions`, `Out of Scope`, `Further Notes`) and
  ordering come from Pocock, not from us.
- Use `chosen-terminology` for every domain noun; do not introduce new
  domain terms here.
- Identify deep-module opportunities for testability and name them in
  Implementation Decisions, per `tdd/deep-modules.md`.
- Keep public-repo-sensitive workflow notes out of the PRD unless they
  are part of the product behavior.
