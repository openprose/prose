# Responsibility Runtime Prompt Fixtures

These fixtures exercise Phase 1 Responsibility Runtime semantics.

They intentionally live outside `skills/open-prose/` because they are test and
evaluation assets, not distributable skill docs.

## Fixture Goals

- classify `kind: responsibility` source
- extract `Goal`, `Continuity`, `Criteria`, `Constraints`, and optional
  `Fulfillment`
- resolve declared fulfillment and leave inference to compiler fixtures where
  `### Fulfillment` is omitted
- explain trigger intent without inventing concrete cron, webhook, or queue
  machinery
- explain the layer split between responsibility source, compiler, harness,
  Reactor, Forme, and bounded runs

## Advisory Prompts

Use these prompts in an agent session with the OpenProse skill loaded.

### Classify Responsibility

Read `01-stargazer-responsibility.prose.md`.

Return:

- the responsibility invariant
- continuity expectations
- criteria
- constraints
- whether the file is directly runnable
- what docs you loaded to interpret it

Expected shape:

- recognizes `kind: responsibility`
- says it is responsibility-oriented source, not a direct `prose run` target
- identifies the four core sections
- avoids treating the bullets as implementation steps

### Resolve Fulfillment And Trigger Intent

Read `01-stargazer-responsibility.prose.md` and
`stargazer-outreach/index.prose.md`.

Return:

- declared fulfillment source
- inferred trigger intent
- ambiguity or warnings
- what should remain for compile or harness code

Expected shape:

- resolves `stargazer-outreach` as the declared fulfillment
- derives judge cadence from the one-business-day continuity requirement
- does not invent provider-specific webhook routes or queue payloads
- says concrete registration belongs to compiled IR and `prose serve`

### Explain Responsibility Runtime Stack

Read `skills/open-prose/responsibility-runtime.md`, then summarize how a new
GitHub star event eventually becomes a bounded OpenProse run.

Expected shape:

- event wakes serve
- serve maps event to an activation from compiled IR
- judge or fulfillment launches as a normal bounded run
- status and pressure are recorded
- Forme manifests wire fulfillment systems
