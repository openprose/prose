# Phase 03: Simple Company Graphs

Goal: create the first real company examples that are useful, inspectable, and
cheap to run.

## 03.1 Implement `company-signal-brief`

Build:

- Add a single-component example that turns caller-provided company signals into
  an operator-ready brief.
- Keep it pure: no external reads, no memory, no delivery.
- Include one happy fixture and one seeded-bad output.

Tests:

- Compile test.
- Scripted-Pi run test.
- Eval acceptance test.
- Live Pi smoke command documented but optional.
- Run `bun run typecheck`.
- Run focused example tests.

Commit:

- Commit as `feat: add company signal brief example`.

Signpost:

- Add `signposts/017-company-signal-brief.md` with sample output and live-smoke
  instructions.

## 03.2 Implement `lead-program-designer`

Build:

- Add a compact graph:
  - `profile-normalizer`
  - `qualification-scorer`
  - `save-grow-program-drafter`
- Use caller-provided enriched profile and brand context.
- Avoid live Exa/GitHub reads in this phase.

Tests:

- Scripted-Pi graph execution test.
- Upstream artifact propagation test.
- Selective recompute test:
  - profile change re-runs scorer and drafter
  - brand-context change re-runs only drafter
- Eval catches generic, non-specific drafts.
- Run `bun run typecheck`.
- Run `bun test`.

Commit:

- Commit as `feat: add lead program designer example`.

Signpost:

- Add `signposts/018-lead-program-designer.md` with graph and recompute
  evidence.

## 03.3 Promote Simple Examples Into Measurements

Build:

- Add both examples to the measurement script.
- Report compile time, graph nodes, executed nodes, reused nodes, eval result,
  and scripted session count.

Tests:

- Run `bun run measure:examples`.
- Assert generated JSON contains the new examples.
- Run `bun run typecheck`.

Commit:

- Commit as `test: measure simple company examples`.

Signpost:

- Add `signposts/019-simple-example-measurements.md` with measurement output
  paths.
