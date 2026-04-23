---
name: selective-recompute
kind: program
---

### Services

- `summarize`
- `market-sync`

### Requires

- `draft`: Markdown<Draft> - source draft to summarize
- `company`: string - company identifier for market data

### Ensures

- `summary`: Markdown<Summary> - cleaned executive summary
- `market_snapshot`: Markdown<Snapshot> - current market snapshot

## summarize
---
kind: service
---

### Requires

- `draft`: Markdown<Draft> - source draft to summarize

### Ensures

- `summary`: Markdown<Summary> - cleaned executive summary

### Effects

- `pure`: deterministic transform over the provided draft

## market-sync
---
kind: service
---

### Runtime

- `freshness`: 1h

### Requires

- `company`: string - company identifier for market data

### Ensures

- `market_snapshot`: Markdown<Snapshot> - current market snapshot

### Effects

- `read_external`: market API, freshness 1h
