# Signpost 015: Public Docs Pass

Date: 2026-04-26
Branch: `rfc/reactive-openprose`

## What Changed

- Refreshed the top-level README and docs index so the public entry path uses
  the current `prose handoff` boundary for single components instead of an old
  `prose run customers/...` example.
- Reframed the runtime release-candidate page as the runtime confidence gate.
- Removed old "near-term" and release-diary phrasing from authored docs.
- Clarified that the OSS package is the local compiler/package/graph/run spine
  and that hosted systems consume the same reports, fixtures, and runtime
  vocabulary.
- Added `test/docs-public.test.ts` so stale public architecture terms do not
  drift back into README/docs.

## Validation

- `rg -n "eventually|future work|near-term|Prose Complete|--provider|openai_compatible|direct provider|fixture provider|local process|provider protocol" README.md docs -S`
- `bun test test/docs-public.test.ts test/cli-ux.test.ts test/examples-tour.test.ts`

## Next

- Continue the public OSS hardening queue from
  `rfcs/015-public-oss-hardening/TODO.md`.
- The next highest-leverage item is the remaining historical provider RFC
  cleanup, because those pages still appear in repository search and can look
  like current implementation guidance.
