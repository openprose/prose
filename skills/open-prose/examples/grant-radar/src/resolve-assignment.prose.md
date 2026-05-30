---
name: resolve-assignment
kind: service
---

# Resolve Assignment

### Description

Turn a free-form `startup_brief` into a schema-valid Research Assignment JSON
that the `grant-finder` CLI can consume. The input name is historical; the brief
may describe a startup, academic lab, PI-led research group, nonprofit research
team, or technical project. This is the agent-side translation step: people talk
in sentences, the CLI takes structured input.

The Research Assignment schema lives at the canonical
[`research-assignment.schema.json`](https://github.com/openprose/grant-finder/blob/main/schemas/research-assignment.schema.json)
in the public grant-finder repo. The service must validate its output against
that schema before publishing it.

### Requires

- `startup_brief`: free-form description of the organization or project, its
  technology or research focus, geography, stage/entity type, and funding
  question

### Ensures

- `research_assignment`: JSON conforming to the canonical Research Assignment
  schema, with these fields filled conservatively:
  - `assignment_id`: a stable slug derived from the organization/project name
    and date
  - `research_question`: a single sentence restating the funding question
  - `company_profile`: `{ name, description, stage, location, technologies, constraints }`
  - `focus_areas`: 2–8 technology/program lanes derived from the brief
  - `target_geographies`: jurisdictions the organization can credibly apply in
  - `known_grants`: any grants the brief explicitly says the team already knows
    about (excluded from CLI ranking)

### Shape

- `self`: parse the brief, extract entities, fill the assignment fields,
  validate against the schema, publish the assignment
- `prohibited`: inventing technology areas the brief does not support;
  inferring jurisdictions the organization has no presence in; coining an
  organization name when the brief does not provide one; emitting an assignment
  that does not validate against the schema

### Strategies

- Read the canonical Research Assignment schema once before drafting so field
  names, required keys, and types are exact. If the host cannot fetch that URL,
  use the field list above and rely on the CLI boundary validation in
  `run-research` to catch schema mistakes.
- Pull `focus_areas` from explicit nouns in the brief, not adjacent
  associations. *"EV charging"* belongs; *"clean energy"* belongs only if the
  brief actually uses those words or a near synonym.
- For `target_geographies`, include `United States` plus any state-level
  jurisdictions the brief names. Do not add states by association.
- For `constraints`, surface anything explicit: *"non-dilutive only"*, *"no
  defense work"*, *"avoid grants requiring matching funds"*. Leave the list
  empty if the brief is silent.
- Validate before publishing. If validation fails, fix the offending field
  and re-validate rather than relaxing the schema.
