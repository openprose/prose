---
name: cost-analyzer
kind: program
services: [collector, analyzer, tracker]
---

requires:
- runs: run[]
- scope: analysis scope -- "single" (exactly one run in the list), "compare" (multiple runs side-by-side), or "trend" (cost patterns over time)

ensures:
- report: cost analysis with per-agent and per-phase token breakdown, model tier efficiency ratings, cost hotspots, and optimization recommendations

errors:
- no-data: no session or token usage data found for the specified run(s)
- invalid-scope: scope is not one of single, compare, trend

strategies:
- when comparing runs: normalize costs by program complexity (number of services, depth of graph) to make comparisons fair
- when identifying hotspots: flag any single agent consuming more than 40% of total tokens
- when recommending optimizations: distinguish between model-tier changes (use cheaper model) and structural changes (reduce context, split services)

invariants:
- all cost figures trace back to actual session data, never estimated or interpolated
- total cost equals the sum of per-agent costs (no unattributed tokens)

---

## collector

requires:
- runs: run[]
- scope: analysis scope

ensures:
- sessions: extracted session data for each agent including model used, input tokens, output tokens, cache hits, and timestamps

errors:
- no-data: no session or token usage data found for the specified run(s)

strategies:
- for "compare" scope: collect sessions from all provided runs
- for "trend" scope: collect sessions from all provided runs in chronological order
- for "single" scope: expect exactly one run in the list

---

## analyzer

requires:
- sessions: extracted session data from all relevant runs

ensures:
- analysis: per-agent cost breakdown, per-phase cost breakdown, model tier efficiency (cost per output token by model), cache efficiency ratios, and identified hotspots

strategies:
- compute cost using standard token pricing for each model tier
- identify cache efficiency as (cache_hits / total_input_tokens) per agent
- flag hotspots: agents with disproportionate cost relative to their output contribution

---

## tracker

requires:
- analysis: cost analysis with breakdowns and hotspots

ensures:
- report: final cost report with clear tables, hotspot highlights, trend visualization (for trend scope), and prioritized optimization recommendations

strategies:
- format costs in both tokens and estimated USD
- for trend scope: show cost trajectory and flag increasing/decreasing patterns
- rank optimization recommendations by estimated savings
