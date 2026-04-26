# 027: Co Starter System Map

Date: 2026-04-26
Branch: `rfc/reactive-openprose`
Commit target: `feat: add company system map starter`

## What Changed

- Added `packages/co/programs/company-system-map.prose.md`.
- Added `packages/co/evals/company-system-map.eval.prose.md`.
- Updated `packages/co/prose.package.json` so the starter map is a declared
  example and the eval is part of the package gate.
- Refreshed `packages/co/README.md` to position `co` as both a starter design
  kit and a repo-readiness gate.
- Updated `fixtures/package-ir/co.summary.json` and `test/co-package.test.ts`
  so the new package surface stays covered.

## Why

The customer reference repo has converged on a system-first Company as Code
shape: systems, responsibilities, workflows, shared capabilities, adapters,
records, and runtime state. The public `co` package only had a checker for repos
that already exist. The new starter map gives users a reusable first program
for designing that shape without copying OpenProse, Inc. private logic.

## How To Test

- `bun run prose lint packages/co`
- `bun run prose publish-check packages/co --strict`
- `bun test test/package-ir.test.ts test/co-package.test.ts`
- `bun run typecheck`

## What Is Next

- Continue the public hardening queue with evidence separation, runtime-profile
  CLI ergonomics, command error consistency, and final public API vocabulary
  cleanup.
