---
name: market-scan
kind: service
---

### Requires

- `company`: CompanyProfile - normalized company profile with citations

### Ensures

- `market_snapshot`: Markdown<MarketSnapshot> - current market and competitor snapshot

### Runtime

- freshness: 24h

### Effects

- `read_external`: public web, freshness 24h
