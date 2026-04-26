---
name: opportunity-discovery-lite
kind: program
---

### Services

- `platform-scan-reader`
- `opportunity-classifier`
- `opportunity-deduplicator`
- `opportunity-summary-writer`

### Requires

- `platform_scan_results`: Json<PlatformScanResults> - caller-provided platform posts, comments, and metadata
- `brand_context`: Markdown<BrandContext> - positioning, target customer, and product constraints

### Ensures

- `platform_scan_window`: Json<PlatformScanWindow> - fresh, source-linked rows accepted for opportunity analysis
- `opportunity_classifications`: Json<OpportunityClassifications> - relevance, urgency, and audience classification by source row
- `opportunity_dedupe_report`: Json<OpportunityDedupeReport> - duplicate clusters and winning source rows
- `opportunity_summary`: Markdown<OpportunitySummary> - ranked opportunities with source-linked reasoning

### Effects

- `pure`: analyzes caller-provided scan rows

## platform-scan-reader

### Requires

- `platform_scan_results`: Json<PlatformScanResults> - caller-provided platform posts, comments, and metadata

### Ensures

- `platform_scan_window`: Json<PlatformScanWindow> - fresh, source-linked rows accepted for opportunity analysis

### Effects

- `pure`: rejects stale, missing-provenance, or low-evidence rows without external reads

## opportunity-classifier

### Requires

- `platform_scan_window`: Json<PlatformScanWindow> - fresh, source-linked rows accepted for opportunity analysis
- `brand_context`: Markdown<BrandContext> - positioning, target customer, and product constraints

### Ensures

- `opportunity_classifications`: Json<OpportunityClassifications> - relevance, urgency, and audience classification by source row

### Effects

- `pure`: classifies only declared scan rows

## opportunity-deduplicator

### Requires

- `platform_scan_window`: Json<PlatformScanWindow> - fresh, source-linked rows accepted for opportunity analysis
- `opportunity_classifications`: Json<OpportunityClassifications> - relevance, urgency, and audience classification by source row

### Ensures

- `opportunity_dedupe_report`: Json<OpportunityDedupeReport> - duplicate clusters and winning source rows

### Effects

- `pure`: deduplicates cross-posts without external reads

## opportunity-summary-writer

### Requires

- `opportunity_classifications`: Json<OpportunityClassifications> - relevance, urgency, and audience classification by source row
- `opportunity_dedupe_report`: Json<OpportunityDedupeReport> - duplicate clusters and winning source rows
- `brand_context`: Markdown<BrandContext> - positioning, target customer, and product constraints

### Ensures

- `opportunity_summary`: Markdown<OpportunitySummary> - ranked opportunities with source-linked reasoning

### Effects

- `pure`: summarizes accepted classifications and dedupe results
