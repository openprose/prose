---
name: explain-top-picks
kind: service
---

# Explain Selected Opportunities

### Description

For each opportunity selected by `rank-opportunities`, invoke
`grant-finder explain <id> --json` to retrieve the per-recommendation evidence
and provenance trail. The CLI already includes summary evidence on each
candidate; `explain` returns the full source trail that the report should cite.

### Requires

- `ranked_recommendations`: agent-reviewed selection from `rank-opportunities`

### Ensures

- `top_pick_explanations`: array of explanation records for the selected
  recommendations, each containing:
  - `recommendation_id`: matches `grants[i].recommendation_id` in the packet
  - `opportunity`: normalized opportunity record
  - `evidence`: list of `{ source_id, url, claim }` items
  - `sources`: list of `{ source_id, source_url, raw_id }` provenance links
  - `notes`: any notes the CLI emitted (e.g., dedupe rationale)
  - `no_llm`: must be `true` on every record

### Skills

- grant-finder

### Shape

- `self`: invoke `explain` for each recommendation in
  `ranked_recommendations.recommendations`, collect results, publish the array
- `prohibited`: inventing evidence the CLI did not return; merging or
  paraphrasing evidence across recommendations; explaining recommendations
  the agent review did not select

### Strategies

- If `ranked_recommendations.recommendations` is empty, publish an empty array.
  Do not fall back to retrieval-ordered candidates; weak candidates belong in
  `rejected_candidates`, not in the recommendation set shown to the founder, PI,
  operator, or project lead.
- Cap explanation work at 5 recommendations. The ranker should already enforce
  this, but keep the bound here too.
- For each selected grant, invoke:
  ```bash
  grant-finder explain "<recommendation_id>" --json
  ```
  The CLI accepts the `rec-<n>` prefix; pass the field verbatim.
- Run the explain calls in parallel — they are read-only against the local
  ledger and do not contend.
- Validate each response's `no_llm: true` before adding it to the output. Drop
  any record where that flag is missing or false and surface the drop in the
  service log.
