# RFC 014 Signposts

Add one signpost after every completed implementation slice.

Do not skip signposts for "small" slices. The point is to leave breadcrumbs
that survive compaction, parallel work, and late-night handoffs.

Each signpost should include:

- date
- branch
- slice id/name
- files changed
- example or runtime capability advanced
- tests run
- tests intentionally not run, with reason
- commit SHA
- next slice
- notable design learnings

## Template

```md
# NNN: Short Slice Name

**Date:** YYYY-MM-DD
**Branch:** `rfc/reactive-openprose`
**Slice:** `02.1A Remove public provider entrypoints`
**Commit:** `abc1234 message`

## What Changed

- ...

## Why It Matters

- ...

## Tests Run

- `bun run typecheck`
- `bun test test/name.test.ts`

## Tests Not Run

- none

## Next Slice

- ...

## Design Learnings

- ...
```
