Date: 2026-04-23

# 026: API Trigger Materialization

## Why This Slice Happened

The first hosted `apps/api` integration started using the OSS local
materialization contract for real package/component work.

That immediately surfaced a small mismatch:

- RFC 005 run records already model `api` as a valid caller trigger
- the Bun CLI parser for `prose materialize` only accepted `manual` and `test`

That would have forced the hosted runtime to persist API-launched runs while
pretending they were manual.

We do not want the hosted substrate to drift from the language/runtime contract
that quickly.

## What Landed

The OSS CLI now accepts:

- `prose materialize ... --trigger api`

and preserves that trigger in the generated run record.

This keeps the local runner contract aligned with:

- RFC 005 caller provenance
- the hosted run creation path in `platform/apps/api`

## Validation

Verified locally:

- `bun test test/compiler.test.ts`
- `bunx tsc --noEmit`

Added a focused CLI-level test that materializes `hello.prose.md` with
`--trigger api` and asserts the resulting `run.json` stores
`caller.trigger = "api"`.

## What This Unblocks

Hosted run creation can now use the OSS local provider directly without
rewriting trigger provenance after the fact.
