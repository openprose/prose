# Phase 07: Std, Co, And Examples Migration

Goal: make every visible package example truthful, executable, and aligned with
the new runtime.

## 07.1 Rebuild Examples As A Capability Tour

Build:

- Replace any examples that no longer demonstrate the ideal model.
- Keep examples concise, concrete, and runnable.
- Cover hello, multi-node graph, selective recompute, `run<T>`, effect gate,
  eval acceptance, package install, and provider selection.

Tests:

- Run compile, plan, package, and fixture run checks for every example.
- Run `bun test`.
- Run `bunx tsc --noEmit`.

Commit:

- Commit as `docs: rebuild examples around executable OpenProse runtime`.

Signpost:

- Add `signposts/033-examples-tour.md` with example list and commands.

## 07.2 Harden Std Roles

Build:

- Ensure std role components have typed public ports, effects, examples, and
  eval links.
- Remove vague contracts that do not produce inspectable artifacts.

Tests:

- Run strict publish check for `packages/std`.
- Run role compile and fixture run checks.
- Run `bun test`.
- Run `bunx tsc --noEmit`.

Commit:

- Commit as `refactor: harden std role components`.

Signpost:

- Add `signposts/034-std-roles.md` with role quality matrix.

## 07.3 Convert Std Controls And Composites To Executable Semantics

Build:

- Convert supported controls to structured control IR.
- Demote unsupported controls to documented patterns until runtime support
  exists.
- Remove JavaScript-like sketches from executable component surfaces.

Tests:

- Run composite expansion and runtime tests for supported controls.
- Run strict publish check for `packages/std`.
- Run `bun test`.
- Run `bunx tsc --noEmit`.

Commit:

- Commit as `refactor: align std controls with executable IR`.

Signpost:

- Add `signposts/035-std-controls-composites.md` with supported vs pattern-only
  controls.

## 07.4 Update Std Evals To The New Run Store

Build:

- Update eval components to consume run store records, artifacts, traces, and
  acceptance records.
- Remove references to older run shapes such as `state.md` if still present.

Tests:

- Run executable eval suite.
- Run strict publish check for `packages/std`.
- Run `bun test`.
- Run `bunx tsc --noEmit`.

Commit:

- Commit as `refactor: update std evals for run store semantics`.

Signpost:

- Add `signposts/036-std-evals.md` with eval coverage and gaps.

## 07.5 Align Co Package With The Reference Pattern

Build:

- Keep `packages/co` generic and reusable.
- Align it with the external Company as Code reference without encoding private
  company-specific logic.
- Ensure it can run locally through fixture and at least one real provider.

Tests:

- Run compile, package, publish-check, and runtime smoke checks for `packages/co`.
- Run `bun test`.
- Run `bunx tsc --noEmit`.

Commit:

- Commit as `refactor: align co package with executable runtime`.

Signpost:

- Add `signposts/037-co-package.md` with local commands and reference
  implementation notes.

## Phase Exit Criteria

- The package no longer advertises non-executable behaviors as working
  runtime features.
- Examples, std, and co pass strict quality checks.
- The reference surface teaches the ideal model by running it.
