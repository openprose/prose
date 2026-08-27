---
name: architecture-view-renderer
kind: function
version: 0.16.0
---

# Architecture View Renderer

Render a disposable visual interface over the canonical program package.

### Parameters

- `rendered`: program-package projection and constraint lattice
- `source_projection`: current Contract source projection

### Returns

- `visual_artifact`: self-contained HTML containing:
    - zoomable Contract map
    - topology profile cards with the standard ASCII thumbnail, fit statement,
      selected regions, and links to the full profile and canonical examples
    - active-frontier emphasis and deferred-concept dimming
    - call, data, state, context, and capability overlays
    - settled, provisional, disputed, and unresolved constraint states
    - source completeness and compile-readiness indicators
    - architecture version and generation timestamp

### Invariants

- HTML is downstream, disposable, and never authoritative.
- Every displayed fact traces to Contract source, an explicit provisional
  marker, or a supporting decision record.
- The view must distinguish proposed architecture from observed runtime traces.

### Strategies

- Generate one self-contained file with no service dependency.
- Default to the current zoom level and active frontier rather than displaying
  the entire graph at full detail.
- Prefer semantic zoom: system purpose → Contract promises → interfaces →
  procedure and evidence.
- Keep the selected topology thumbnail visible as an orientation landmark while
  zooming. Highlight the current region instead of redrawing the whole system.
- Keep meaningful layout hints beside the system-level composition in
  `index.prose.md`; keep incidental coordinates in the generated artifact.

This renderer remains an internal function initially. Promote it to a separate
downstream Contract only when another program needs the view independently or
when its interface stabilizes enough to reuse.
