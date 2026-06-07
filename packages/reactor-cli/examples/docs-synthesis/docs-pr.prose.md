---
name: docs-pr
kind: responsibility
---

### Goal

Turn the pending documentation edits from the five sections into one pull request
against the public docs repository (`openprose/docs`), coalesced once per burst.
This is the terminal actuator: unlike the upstream transforms, its job IS to act —
to read the specific pages its proposals name, draft the concrete `.mdx` changes,
and open a single PR. It runs only when there is real doc work, so its cost is paid
only on genuine surprise.

For each pending edit, draft the change to its target page under
`content/docs/<section>/<page>.mdx`, preserving the Fumadocs frontmatter
convention (a `title` and a `description` only) and the section's existing voice.
Write all drafted changes onto one branch of a local clone of the docs repo,
commit, and open one PR that lists the source PRs it was derived from. When live,
use git and the GitHub CLI (`gh`) for the branch, commit, and PR. Derive the branch
name deterministically from the set of cited source-PR numbers, so a re-run with
the same pending edits updates the same branch instead of opening a duplicate PR.

### Requires

- the pending-edits facet of cli-docs
- the pending-edits facet of sdk-docs
- the pending-edits facet of reactor-docs
- the pending-edits facet of devtools-docs
- the pending-edits facet of openprose-docs

### Maintains

A docs-update pull request. Material: the content hash of the proposed unified diff
across the touched `.mdx` pages, the deterministic branch name (derived from the
set of cited source-PR numbers), and the fingerprint tuple of the pending-edit
facets consumed in this render. Once a PR has been opened for a branch, its number
is material too. The generated time and any local clone path are immaterial. The PR
is a derived projection: it is fingerprinted over the structured pending-edit
snapshot plus the diff hash, never over free-form prose, so a re-render of
identical pending edits produces an identical fingerprint and opens no second PR.

Postcondition: the branch name is a deterministic function of the cited source-PR
numbers; every touched page exists under its section; the diff hash is computed
from the bytes actually drafted.

#### opened-pr
The opened pull request: its branch name, the set of source-PR numbers it
addresses, and (once live and opened) its PR number and url.

### Continuity

- input-driven, coalesced: wake when any of the five pending-edits facets moves.
  When several sections' pending edits move in the same burst, render once after
  the upstream receipts settle, not once per section, so one burst yields one PR.
- memo-skip: if all subscribed input fingerprints are unchanged, open nothing and
  publish nothing.

### Invariants

- This render's job is to act, so — unlike the upstream transforms — it MAY read
  the specific `.mdx` pages its pending edits name and the cited source PRs' actual
  changes. It is still bounded: read ONLY those named pages and cited PRs, never a
  full docs-repo crawl, a full code-repo crawl, or node_modules. Compose the diff
  FROM the pending-edit pointers it was woken with; do not re-derive the section
  truths.
- The only writable external surface is a branch on a local clone of the docs
  repository and the pull request opened from it. Never push to or modify the
  watched code repository, and never push to the docs repository's default branch.
- Dry-run guard: when `REACTOR_OFFLINE` is set or `DOCS_SYNTH_DRY_RUN` is truthy,
  do not run git, `gh`, or any network; instead write the proposed unified diff and
  the deterministic branch name into this node's world-model as a dry-run plan. The
  reactive core (classify, accumulate, coalesce) is identical in both modes; only
  this terminal effect is gated. The committed `replay/` is produced by a keyed run
  with `DOCS_SYNTH_DRY_RUN=1`, so the renders are real but no live PR is opened.
