---
name: selective-recompute
kind: program
---

### Services

- `summarize`
- `market-sync`

### Requires

- `draft`: Markdown<Draft> - source draft to summarize
- `company`: string - company identifier for market refresh

### Ensures

- `summary`: Markdown<Summary> - cleaned executive summary
- `market_snapshot`: Markdown<MarketSnapshot> - current market snapshot

### Effects

- `read_external`: market API, freshness 1h

## summarize
---
kind: service
---

### Requires

- `draft`: Markdown<Draft> - source draft to summarize

### Ensures

- `summary`: Markdown<Summary> - cleaned executive summary

### Effects

- `pure`: deterministic summary transform over the provided draft

## market-sync
---
kind: service
---

### Runtime

- `freshness`: 1h

### Requires

- `company`: string - company identifier for market refresh

### Ensures

- `market_snapshot`: Markdown<MarketSnapshot> - current market and competitor snapshot

### Effects

- `read_external`: market API, freshness 1h
