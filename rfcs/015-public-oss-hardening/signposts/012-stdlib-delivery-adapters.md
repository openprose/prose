# 012 Stdlib Delivery Adapters

Date: 2026-04-26
Branch: `rfc/reactive-openprose`
Commit target: `docs: simplify std delivery adapters`

## Finding

The delivery adapters were meant to be reusable contracts with explicit effects,
environment requirements, invariants, and acceptance criteria. `email-notifier`
instead included a long host-specific Python SMTP script and curl/API recipes,
which made the standard library look like old skill instructions.

## What Changed

- Replaced the email script block with provider-neutral requirements for SMTP,
  Resend, SendGrid, Postmark, and SES.
- Kept key behavioral requirements: exact HTML delivery, Reply-To preservation,
  provider error mapping, message receipts, and secret redaction.
- Replaced storage SDK/CLI wording in `file-writer` with adapter-oriented
  object-storage and filesystem language.
- Added `test/std-delivery.test.ts` to keep delivery contracts compile-clean
  and free of host-specific implementation recipes.
- Marked the RFC 015 delivery-adapter TODO as done.

## Tests Run

- `rg -n "Bash tool|write a Python script|curl via|Claude Code|/tmp/send_email.py" packages/std/delivery`
- `bun test test/std-delivery.test.ts`
- `bun run prose lint packages/std/delivery`
- `bun run prose publish-check packages/std --strict`
- `bun run typecheck`
- `git diff --check`

## Result

The delivery package now reads as standard-library contract surface instead of
a pasted host playbook.

## Next Slice

Move to the public docs pass or schema-validation contract, depending on which
looks riskier after the next scan.
