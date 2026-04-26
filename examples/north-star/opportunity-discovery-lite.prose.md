---
name: opportunity-discovery-lite
kind: program
---

### Services

- `opportunity-classifier`
- `opportunity-deduper`
- `opportunity-summarizer`

### Requires

- `platform_scan_results`: Json<PlatformScanResults> - caller-provided platform posts, comments, and metadata
- `brand_context`: Markdown<BrandContext> - positioning, target customer, and product constraints

### Ensures

- `opportunity_classifications`: Json<OpportunityClassifications> - relevance, urgency, and audience classification by source row
- `opportunity_dedupe_report`: Json<OpportunityDedupeReport> - duplicate clusters and winning source rows
- `opportunity_summary`: Markdown<OpportunitySummary> - ranked opportunities with source-linked reasoning

### Effects

- `pure`: analyzes caller-provided scan rows

## opportunity-classifier

### Requires

- `platform_scan_results`: Json<PlatformScanResults> - caller-provided platform posts, comments, and metadata
- `brand_context`: Markdown<BrandContext> - positioning, target customer, and product constraints

### Ensures

- `opportunity_classifications`: Json<OpportunityClassifications> - relevance, urgency, and audience classification by source row

### Effects

- `pure`: classifies only declared scan rows

## opportunity-deduper

### Requires

- `platform_scan_results`: Json<PlatformScanResults> - caller-provided platform posts, comments, and metadata
- `opportunity_classifications`: Json<OpportunityClassifications> - relevance, urgency, and audience classification by source row

### Ensures

- `opportunity_dedupe_report`: Json<OpportunityDedupeReport> - duplicate clusters and winning source rows

### Effects

- `pure`: deduplicates cross-posts without external reads

## opportunity-summarizer

### Requires

- `opportunity_classifications`: Json<OpportunityClassifications> - relevance, urgency, and audience classification by source row
- `opportunity_dedupe_report`: Json<OpportunityDedupeReport> - duplicate clusters and winning source rows

### Ensures

- `opportunity_summary`: Markdown<OpportunitySummary> - ranked opportunities with source-linked reasoning

### Effects

- `pure`: summarizes accepted classifications and dedupe results

