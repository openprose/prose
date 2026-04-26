# 010 Hardening Intake Refresh

Date: 2026-04-26
Branch: `rfc/reactive-openprose`
Commit target: `docs: refresh oss hardening intake`

## Finding

A broader scan after the remote host-log slice found three public-package risks
that deserved explicit queue entries before fixes:

- historical provider RFC pages remain too easy to mistake for current runtime
  guidance
- stdlib ops programs still mention `state.md` and marker-based run logs
- delivery adapters include long host-specific Bash/Python/curl recipes instead
  of contract-first adapter requirements

## What Changed

- Added focused TODO items for the three findings under RFC 015.
- Kept the queue aligned with the slice protocol: fix one cluster, test it,
  signpost it, then commit and update the platform submodule.

## Checks Run

- Broad repository scan with `rg` for obsolete/runtime-provider vocabulary
- Manual inspection of stdlib ops, delivery adapters, and current user-facing
  docs
- `git diff --check`

## Next Slice

Start with the stdlib ops cleanup because it is concrete, public-facing, and
low-risk: replace `state.md`-era contracts with current run/trace/store
contracts and add a regression test against obsolete runtime artifacts.
