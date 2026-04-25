# Phase 02: Executable IR And Source Model

Goal: make IR the canonical executable package contract, not just a component
snapshot used by tooling.

## 02.1 Compile Packages As First-Class Units

Build:

- Add a package/workspace compiler entry point.
- Resolve package metadata, component files, schemas, evals, examples, and
  dependency pins into one package IR.
- Preserve per-file source maps and diagnostics.

Tests:

- Add package IR golden fixtures for `examples`, `packages/std`, and
  `packages/co`.
- Run `bun test`.
- Run `bunx tsc --noEmit`.
- Run `bun bin/prose.ts package examples --format json`.

Commit:

- Commit as `feat: compile OpenProse packages into canonical IR`.

Signpost:

- Add `signposts/005-package-ir.md` with the package IR shape, fixture paths,
  and known gaps.

## 02.2 Replace Raw Execution Text With Structured Execution IR

Build:

- Parse execution sections into a structured IR with `call`, `parallel`,
  `loop`, `condition`, `try`, `return`, and explicit bindings where supported.
- Preserve the original text and source spans for diagnostics.
- Fail or warn clearly for syntax that is still prose-only.

Tests:

- Add golden fixtures for simple call, parallel, loop, conditional, and return
  cases.
- Run `bun test`.
- Run `bunx tsc --noEmit`.
- Run `bun bin/prose.ts compile examples/company-intake.prose.md`.

Commit:

- Commit as `feat: add structured execution IR`.

Signpost:

- Add `signposts/006-execution-ir.md` with supported constructs, unsupported
  constructs, and migration notes for std controls.

## 02.3 Make Composite Expansion Source-Mapped

Build:

- Expand composites into executable child nodes in package IR.
- Preserve parent/child source maps and semantic hashes.
- Record explicit expansion diagnostics when inputs cannot be bound.

Tests:

- Add composite expansion goldens for std composed examples.
- Run `bun test`.
- Run `bunx tsc --noEmit`.
- Run graph CLI smoke on a composite example.

Commit:

- Commit as `feat: source-map composite expansion in IR`.

Signpost:

- Add `signposts/007-composite-expansion.md` with expansion rules and examples.

## 02.4 Capture Schemas, Evals, Examples, And Policies In IR

Build:

- Represent schema declarations, eval links, examples, effects, access, and
  policy labels directly in package IR.
- Separate source hash, semantic IR hash, dependency hash, policy hash, and
  runtime config hash.

Tests:

- Add IR goldens covering schema, eval, access, and policy changes.
- Run `bun test`.
- Run `bunx tsc --noEmit`.
- Run `bun bin/prose.ts publish-check packages/std --strict`.

Commit:

- Commit as `feat: include schemas evals and policy in package IR`.

Signpost:

- Add `signposts/008-ir-contract-metadata.md` with hash semantics and public
  metadata implications.

## 02.5 Add Meta-Operation Proposal Records

Build:

- Define durable records for intelligent wiring, contract repair, missing
  metadata suggestions, eval generation, and failure diagnosis.
- Make accepted proposals deterministic inputs to graph normalization.
- Store rejected and pending proposals outside source unless explicitly applied.

Tests:

- Add unit tests for proposal serialization and acceptance state.
- Add graph tests proving accepted proposals change wiring deterministically.
- Run `bun test`.
- Run `bunx tsc --noEmit`.

Commit:

- Commit as `feat: model intelligent meta-operation proposals`.

Signpost:

- Add `signposts/009-meta-proposals.md` with accepted storage shape and
  unanswered product questions.

## Phase Exit Criteria

- Package IR is the canonical input to planner/runtime/package tooling.
- Execution-relevant fields have source maps and stable hashes.
- Intelligent operations produce inspectable proposals rather than invisible
  runtime behavior.
