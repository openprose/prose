---
name: format-report
kind: service
---

# Format Report

### Description

Compose a concise markdown report for the founder, PI, operator, or project lead
from the deterministic Research Packet, the agent-reviewed recommendations, and
the CLI provenance records. `rank-opportunities` has already made the judgment
call about what is worth recommending; this service renders that decision
clearly.

### Requires

- `research_packet`: Research Packet from `run-research`
- `ranked_recommendations`: agent-reviewed ranking from `rank-opportunities`
- `top_pick_explanations`: per-recommendation explanations from `explain-top-picks`

### Ensures

- `markdown_report`: a markdown document with these sections:
  - `# Funding Pipeline — <organization or project name>` header
  - `## Summary`: total potential funding, count of high-fit grants, nearest
    deadline, one-line note on retrieval backend and `no_llm` status
  - `## Recommended Opportunities`: one concise subsection per
    `ranked_recommendations.recommendations` item, with agency, deadline,
    confidence, why it fits, caveats, next step, and source URL
  - `## Not Recommended`: compact table of important rejected candidates when
    `ranked_recommendations.rejected_candidates` is non-empty
  - `## Coverage`: a table mirroring `research_packet.coverage` — one row per
    source lane, with status and note columns
  - `## Negative Evidence`: an explicit callout listing coverage rows whose
    status is `checked_no_match`, especially the ARPA-E row when present
  - `## Coverage Gaps`: required when any coverage row is `not_checked` or
    `ranked_recommendations.search_inconclusive == true`
  - `## Provenance`: a line stating the retrieval backend, refresh policy, and
    `generated_at` timestamp from the packet

### Shape

- `self`: render the structured packet, agent-reviewed ranking, and
  explanations into markdown using the sections above, in the order specified
- `prohibited`: introducing claims not backed by `evidence` items;
  re-ranking grants; hiding rejected candidates that explain why no
  recommendation was made; hiding negative-evidence rows; presenting weak
  retrieval records as recommendations

### Strategies

- Keep the report short and scannable. Avoid raw retrieval internals unless
  they are needed to explain a rejection.
- If `ranked_recommendations.no_good_matches` is true, say so directly and do
  not create a fake Recommended Opportunities section. Explain which source
  lanes were checked and what a human should try next.
- If `ranked_recommendations.search_inconclusive` is true, or if summary notes
  say source refresh was inconclusive, do not say "no credible current
  recommendation" as the main conclusion. Say the search is incomplete,
  include the source/setup failure, and tell the user to fix the environment
  or rerun before treating the result as funding advice.
- For each recommended opportunity, link the program name to the packet URL and
  include one evidence URL from the matching explanation.
- Do not dump every evidence field into the main body. Put source details in a
  short `<details>` block only for recommended opportunities.
- For the Negative Evidence section, surface every coverage row where
  `status == "checked_no_match"` and `note` is non-empty. The CLI specifically
  encodes "no current ARPA-E programs match" as a load-bearing absence; do not
  filter it out.
- For the Coverage Gaps section, surface every row where
  `status == "not_checked"` and explain that these rows are not negative
  evidence.
- Keep the entire report under 200 lines for legibility.
