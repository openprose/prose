# Signpost 018: Historical Provider RFC Stubs

Date: 2026-04-26
Branch: `rfc/reactive-openprose`

## What Changed

- Collapsed RFC 013 Phase 04 provider-protocol pages into short historical
  stubs.
- Preserved the signposts as the detailed implementation diary.
- Made the current architecture explicit at the phase entry point:
  - Pi graph VM
  - node runners
  - Pi runtime profiles for model providers
  - scripted Pi for deterministic `--output`
  - `prose handoff` for single-component portability
- Added `test/rfc-history.test.ts` so the historical Phase 04 pages do not
  regain implementation-playbook sections such as `Build:`, `Tests:`, or
  `Commit as`.

## Validation

- `bun test test/rfc-history.test.ts test/docs-public.test.ts`
- `rg -n 'Commit as|Build:|Tests:|ProviderRequest|ProviderResult' rfcs/013-ideal-oss-package-restructure/phases/04-provider-protocol`
- Manual read-through of
  `rfcs/013-ideal-oss-package-restructure/phases/04-provider-protocol/README.md`

## Next

- Move from documentation cleanup into implementation cleanup. The next
  high-leverage item is the old public `materializeSource` seam.
