---
name: rank-opportunities
kind: service
---

# Rank Opportunities

### Description

Review the deterministic candidate packet from `grant-finder research` and
decide which opportunities, if any, should be recommended to the founder, PI,
operator, or project lead.

The CLI is intentionally conservative and mechanical: it refreshes deterministic
public sources, retrieves ledger records, attaches evidence, reports source
coverage, and marks `no_llm: true`. This service is where agent judgment
belongs. It applies the assignment constraints, rejects poor fits, and writes
concise, evidence-grounded recommendation rationales.

### Requires

- `research_assignment`: schema-valid Research Assignment JSON from
  `resolve-assignment`
- `research_packet`: deterministic candidate packet from `run-research`

### Ensures

- `ranked_recommendations`: JSON object with:
  - `recommendations`: array of 0-5 selected opportunities, each containing:
    - `recommendation_id`: copied from `research_packet.grants[*]`
    - `rank`: 1-based rank after agent review
    - `program_name`: copied from the packet
    - `agency`: copied from the packet
    - `confidence`: `high`, `medium`, or `watch`
    - `why_this_fits`: concise rationale grounded in assignment facts and
      packet evidence
    - `caveats`: concrete eligibility or freshness concerns
    - `next_step`: one practical action for the organization or upstream agent
  - `rejected_candidates`: array of candidates that looked superficially
    plausible but should not be recommended, each with
    `recommendation_id`, `program_name`, and `reason`
  - `no_good_matches`: boolean, true when no candidate is good enough to
    recommend
  - `search_inconclusive`: optional boolean, true when the packet indicates
    source refresh failed or key source lanes were not checked
  - `review_notes`: brief notes on source coverage and search limitations

### Shape

- `self`: read the assignment constraints and every candidate in
  `research_packet.grants`; select only opportunities that are credible for
  the specific organization; publish `ranked_recommendations`
- `prohibited`: recommending a candidate that contradicts explicit assignment
  constraints; treating retrieval order or preliminary fit labels as final
  judgment; inventing eligibility, amount, deadline, or source claims;
  recommending records whose evidence is only generic SBIR/STTR language with
  no domain match; filling the report with weak picks because the packet has
  no strong matches

### Strategies

- Start from the assignment, not the packet order. Extract the organization's
  stage, entity type, geography, technologies, application constraints, and
  known exclusions before reading candidates.
- Review every candidate in `research_packet.grants`. For each candidate,
  decide whether the packet evidence proves all of these:
  - entity fit: the applicant type is plausible for this organization
  - domain fit: the source text mentions the organization's technology, market,
    research area, or application lane
  - actionability: the record is a live or monitor-worthy funding path, not
    only historical context or broad ecosystem news
  - constraint fit: the candidate does not conflict with explicit exclusions
- Reject SBIR/STTR records for academic labs or any assignment that says
  SBIR/STTR is not the right vehicle.
- Reject generic small-business programs when the evidence does not mention
  the organization's domain, technology, geography, or application lane.
- Treat broad umbrella records, parent announcements, and news items as
  `watch` at best unless the evidence points to a concrete live solicitation.
- Use `confidence: high` only for a live, source-backed opportunity with clear
  entity and domain fit. Use `medium` for plausible but incomplete fit. Use
  `watch` for source trails worth monitoring but not ready to apply to.
- Prefer fewer recommendations over noisy recommendations. If nothing is a
  credible fit, set `recommendations: []`, `no_good_matches: true`, and explain
  what source lanes were checked.
- If `research_packet.summary.notes` says source refresh was inconclusive, or
  coverage rows are `not_checked` because refresh failed, set
  `search_inconclusive: true`. In that case, do not describe the result as
  evidence that no matching opportunities exist; describe it as an incomplete
  search and name the setup/source problem.
- Put important near-misses in `rejected_candidates`. A good rejection is often
  more useful than a bad recommendation because it tells the organization what
  not to waste time on.
- Keep rationales short. A founder, PI, operator, or project lead should be
  able to scan the whole object in under a minute.
