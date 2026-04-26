---
name: agent-ecosystem-index-refresh
kind: program
---

### Services

- `agent-crawl-target-builder`
- `agent-crawl-batch-reader`
- `agent-ecosystem-scorer`
- `agent-index-report-writer`

### Requires

- `agent_platform_seed_list`: Json<AgentPlatformSeedList> - platforms, docs, repos, and communities to inspect
- `agent_index_policy`: Markdown<AgentIndexPolicy> - scoring policy, evidence requirements, and curation constraints

### Ensures

- `agent_crawl_targets`: Json<AgentCrawlTargets> - normalized crawl targets and model-routing intent
- `agent_crawl_batches`: Json<AgentCrawlBatches> - fetched or fixture-provided evidence rows
- `agent_ecosystem_index`: Json<AgentEcosystemIndex> - scored platform index with citations
- `agent_index_report`: Markdown<AgentIndexReport> - publishable summary of the ecosystem refresh

### Effects

- `read_external`: public docs and repositories, freshness 24h

## agent-crawl-target-builder

### Requires

- `agent_platform_seed_list`: Json<AgentPlatformSeedList> - platforms, docs, repos, and communities to inspect

### Ensures

- `agent_crawl_targets`: Json<AgentCrawlTargets> - normalized crawl targets and model-routing intent

### Effects

- `pure`: builds crawl targets from declared seed rows

## agent-crawl-batch-reader

### Requires

- `agent_crawl_targets`: Json<AgentCrawlTargets> - normalized crawl targets and model-routing intent

### Ensures

- `agent_crawl_batches`: Json<AgentCrawlBatches> - fetched or fixture-provided evidence rows

### Effects

- `read_external`: public docs and repositories, freshness 24h

## agent-ecosystem-scorer

### Requires

- `agent_crawl_batches`: Json<AgentCrawlBatches> - fetched or fixture-provided evidence rows
- `agent_index_policy`: Markdown<AgentIndexPolicy> - scoring policy, evidence requirements, and curation constraints

### Ensures

- `agent_ecosystem_index`: Json<AgentEcosystemIndex> - scored platform index with citations

### Effects

- `pure`: scores only accepted crawl evidence

## agent-index-report-writer

### Requires

- `agent_ecosystem_index`: Json<AgentEcosystemIndex> - scored platform index with citations

### Ensures

- `agent_index_report`: Markdown<AgentIndexReport> - publishable summary of the ecosystem refresh

### Effects

- `pure`: renders an operator report from the scored index

