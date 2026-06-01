---
name: agent-index-markdown
kind: responsibility
---

# Agent Index (Markdown)

> One of the two TERMINAL artifacts (the dual MD + HTML tenet). A portable
> Markdown index that can be read in any editor or committed into a private ops
> repo. It is the artifact that the folded-in Session → Prose node feeds: the
> index lists the extracted `.prose` program alongside the session and cluster
> rollup.

### Requires

- the `rollup` facet of `workstream-index` — the cheap incremental session/cluster rollup
- `concept-clusterer` (via `@atomic`) — the cluster graph
- `session-to-prose` (via `@atomic`) — the extracted program metadata

### Maintains

The Markdown index artifact:

- `path`: `agent-index.md`
- `markdown`: a stable Markdown index with headings for sessions, clusters, and
  the extracted program
- `content_hash`: a stable digest so an unchanged render is a memo hit and the
  on-disk file is not rewritten

### Continuity

- input-driven: a moved `rollup` facet on `workstream-index`, a changed cluster
  graph from `concept-clusterer`, or a changed extracted program from
  `session-to-prose`, wakes the index.
- A quiet drain leaves the Markdown content hash unchanged — the file is not
  rewritten, so a no-change replay preserves the same content hash.
