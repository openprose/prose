---
name: normalize-performance-signals
kind: service
---

# Normalize Performance Signals

### Shape

- `self`: reconcile supplied metrics, content metadata, and campaign context
- `prohibited`: inventing missing measurements or changing source data

### Requires

- `content_inventory`: content assets and their intended audience or job
- `performance_exports`: raw metrics from analytics, search, CRM, email, and
  distribution channels
- `campaign_notes`: promotions, launches, measurement gaps, or external events
  relevant to the review window

### Ensures

- `performance_snapshot`: normalized evidence table grouped by content asset,
  channel, funnel role, and review period
- `measurement_caveats`: known gaps, stale sources, attribution issues, and
  outliers that should constrain interpretation

### Errors

- `insufficient-evidence`: supplied inputs do not contain enough comparable
  performance signal to support a weekly review

### Strategies

- Separate absolute performance from relative movement.
- Preserve caveats beside the affected asset instead of burying them in a
  general note.
