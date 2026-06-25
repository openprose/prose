---
name: dashboard
kind: responsibility
version: 0.15.0
---

### Goal

Render a single Markdown index from the four domain truths (decisions, backlog,
use-case patterns, and attention queue) as one composed artifact. The dashboard
is a consumer of maintained truths, not the point of the architecture.

### Requires

- the open-decisions and decision-history facets of the decisions log
- the open-items and by-project-counts facets of the eng-backlog
- the active-patterns facet of the use-case guide
- the needs-user and decision-blocked facets of the attention queue

### Maintains

A Markdown index document, written to `index.md`. Material: the content hash of
the written Markdown bytes and the fingerprint tuple of the domain facets consumed
in this render. The generated time and the file path are immaterial. The index is
a derived projection: it is fingerprinted over the structured input snapshot plus
the file hash, never over the free-form prose, so a re-render of identical inputs
produces an identical fingerprint.

Privacy: the index shows derived domain truths (decisions, backlog items,
patterns, attention reasons); it never embeds full transcript content or secrets.

Postcondition: the content hash is computed from the bytes actually written; the
recorded input snapshot matches the facet fingerprints consumed in this render.

### Continuity

- input-driven, coalesced: wake when any of the seven subscribed facets moves.
  When several domain truths move in the same burst, render once after the
  upstream receipts settle, not once per upstream.
- memo-skip: if all subscribed input fingerprints are unchanged, leave `index.md`
  untouched and publish nothing.

### Invariants

- This render is a bounded composition over the domain facets it was woken with.
  Compose the index FROM those structured truths; never re-read sessions, scan the
  filesystem, read the repo, or run shell commands. Complete in a few steps.
- The only writable surface is this node's published world-model (`index.md`).
