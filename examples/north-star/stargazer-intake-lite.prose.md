---
name: stargazer-intake-lite
kind: program
---

### Services

- `stargazer-ranker`
- `stargazer-enricher`
- `stargazer-memory-writer`
- `stargazer-digest-writer`

### Requires

- `stargazer_batch`: Json<GitHubStargazerBatch> - latest GitHub stargazer rows, including timestamps and handles
- `prior_stargazer_memory`: Json<StargazerMemory> - previous high-water mark and handled stargazers

### Ensures

- `ranked_stargazers`: Json<RankedStargazers> - deduplicated stargazers ranked for follow-up
- `stargazer_enrichment_records`: Json<StargazerEnrichmentRecords> - selected enrichments safe for internal use
- `stargazer_memory_delta`: Json<StargazerMemoryDelta> - proposed high-water mark and idempotent memory update
- `stargazer_digest`: Markdown<StargazerDigest> - operator digest without sensitive enrichment fields

### Effects

- `writes_memory`: commits high-water state only after the graph succeeds

## stargazer-ranker

### Requires

- `stargazer_batch`: Json<GitHubStargazerBatch> - latest GitHub stargazer rows, including timestamps and handles
- `prior_stargazer_memory`: Json<StargazerMemory> - previous high-water mark and handled stargazers

### Ensures

- `ranked_stargazers`: Json<RankedStargazers> - deduplicated stargazers ranked for follow-up

### Effects

- `pure`: ranks caller-provided stargazer rows without committing memory

## stargazer-enricher

### Requires

- `ranked_stargazers`: Json<RankedStargazers> - deduplicated stargazers ranked for follow-up

### Ensures

- `stargazer_enrichment_records`: Json<StargazerEnrichmentRecords> - selected enrichments safe for internal use

### Effects

- `pure`: enriches only from fixture-provided fields in local tests

## stargazer-memory-writer

### Requires

- `ranked_stargazers`: Json<RankedStargazers> - deduplicated stargazers ranked for follow-up
- `prior_stargazer_memory`: Json<StargazerMemory> - previous high-water mark and handled stargazers

### Ensures

- `stargazer_memory_delta`: Json<StargazerMemoryDelta> - proposed high-water mark and idempotent memory update

### Effects

- `writes_memory`: prepares the memory update for commit after graph success

## stargazer-digest-writer

### Requires

- `ranked_stargazers`: Json<RankedStargazers> - deduplicated stargazers ranked for follow-up
- `stargazer_enrichment_records`: Json<StargazerEnrichmentRecords> - selected enrichments safe for internal use
- `stargazer_memory_delta`: Json<StargazerMemoryDelta> - proposed high-water mark and idempotent memory update

### Ensures

- `stargazer_digest`: Markdown<StargazerDigest> - operator digest without sensitive enrichment fields

### Effects

- `pure`: renders a digest from accepted upstream artifacts

