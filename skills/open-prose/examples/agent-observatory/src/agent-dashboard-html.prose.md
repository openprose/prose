---
name: agent-dashboard-html
kind: responsibility
---

# Agent Dashboard (HTML)

> The second of the two TERMINAL artifacts (the dual MD + HTML tenet). A local,
> static HTML dashboard that can be opened without a server — active sessions,
> clusters, and recent changes rendered for a glance. It reads the same cheap
> rollup the Markdown index does, so the two artifacts re-render together only
> when DashboardData actually moved.

### Requires

- the `rollup` facet of `workstream-index` — the cheap incremental session/cluster rollup
- `concept-clusterer` (via `@atomic`) — the cluster graph

### Maintains

The HTML dashboard artifact:

- `path`: `agent-dashboard.html`
- `html`: a self-contained static HTML document (no server, no external assets)
- `content_hash`: a stable digest so an unchanged render is a memo hit

Redact private terms before producing any shareable projection.

### Continuity

- input-driven: a moved `rollup` facet on `workstream-index`, or a changed
  cluster graph from `concept-clusterer`, wakes the dashboard.
- A no-change replay preserves the same HTML content hash, so the dashboard file
  is not rewritten.
