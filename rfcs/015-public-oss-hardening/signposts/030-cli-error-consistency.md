# 030: CLI Error Consistency

Date: 2026-04-26
Branch: `rfc/reactive-openprose`
Commit target: `fix: format cli command failures`

## What Changed

- Added a top-level guard around `runCli`.
- Kept command-specific error messages where they already add context.
- Added CLI UX regression coverage for missing source compilation and invalid
  registry install failures.

## Why

The public CLI should not leak Bun stack traces for ordinary user mistakes.
Several commands were already carefully formatted, but commands such as
`compile` and `install` could still throw through the process boundary. A
single guard makes the default behavior consistent without hiding the existing
actionable messages for status, trace, graph VM validation, run, or remote
execution.

## How To Test

- `bun test test/cli-ux.test.ts`
- `bun run typecheck`

## What Is Next

- Finish the provider-to-node-runner vocabulary cleanup and then sweep the
  intake queue for secrets/ignored generated artifacts and diagram indexing.
