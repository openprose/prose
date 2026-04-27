# Signpost 035: Findings Archive Sync

Date: 2026-04-27

## What Changed

- Updated `rfcs/015-public-oss-hardening/FINDINGS.md` so it no longer presents
  resolved hardening findings as active open work.
- Left the original findings text intact as an audit archive and pointed future
  agents at `TODO.md` plus the slice signposts for the actual resolution trail.

## Why

The RFC 015 TODO queue is resolved, but the stable findings inventory still
looked like a live backlog. That creates false urgency and can pull future work
back into already-fixed seams. The archive now says plainly that there are no
current open RFC 015 findings.

## How To Verify

```bash
rg -n "^## Open Findings" rfcs/015-public-oss-hardening/FINDINGS.md
rg -n "Current Open Findings|Resolved Findings Archive" rfcs/015-public-oss-hardening/FINDINGS.md
git diff --check
```

## Next

- Add newly discovered OSS launch issues to `TODO.md` first, then promote them
  into fresh focused slices with tests and signposts.
