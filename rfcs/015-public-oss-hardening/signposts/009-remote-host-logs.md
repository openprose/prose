# 009 Remote Host Logs

Date: 2026-04-26
Branch: `rfc/reactive-openprose`
Commit target: `feat: allow remote envelopes to include host logs`

## Finding

`executeRemoteFile` always wrote empty `stdout.txt` and `stderr.txt`. That is
fine for deterministic hosted-contract fixtures, but real hosted workers need a
clean way to preserve host-level logs in the same envelope.

## Decision

OpenProse traces remain the canonical runtime timeline. Host stdout/stderr are
host-captured artifacts, not the source of runtime truth.

## What Changed

- Added optional `stdout` and `stderr` fields to `RemoteExecuteOptions`.
- Remote envelopes still default both files to empty strings.
- When provided, host log content is written to `stdout.txt` and `stderr.txt`
  and included in the artifact manifest.
- Documented the hosted log convention.
- Marked the RFC 015 TODO item as done.

## Tests Run

- `bun test test/runtime-materialization.test.ts test/hosted-contract-fixtures.test.ts`
- `bun run typecheck`
- `git diff --check`

## Result

Hosted workers can now fill log artifacts without forking the runtime contract
or changing deterministic fixture behavior.

## Next Slice

Move to schema validation depth or CLI error consistency.
