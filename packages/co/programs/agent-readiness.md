---
name: agent-readiness
kind: program
---


# Agent Readiness

Probe a company's website for signals AI agents look for when discovering and
using a product: well-known paths, machine-readable metadata, structured
documentation, and plain-HTML accessibility. Produce a scored markdown report
with three concrete, file-path-level fixes.

Designed as a short interactive intake that asks for the minimum input,
fetches a fixed set of well-known paths (no JavaScript rendering required),
and writes the report to a fresh per-company workspace the caller can open
immediately.

### Requires

- `company_name`: company name (e.g. "Acme")
- `domain`: primary domain or full URL (e.g. `acme.com` or `https://acme.com`)
- `focus`: what agents most need to access — one of `marketing-site`,
  `product-docs`, `public-api`, or `all`. Default `all`.

### Ensures

- `workspace_dir`: absolute path to a newly created per-company workspace at
  `~/prose-<slug>/` where `<slug>` is lowercased, hyphenated `company_name`
- `report_path`: absolute path to the written report markdown file at
  `<workspace_dir>/agent-readiness.md`
- `overall_score`: integer 0-100 summarizing agent readiness under the
  selected focus
- `dimension_scores`: map of dimension → integer 0-100 for each applicable
  dimension (discoverability, parseability, structure, api_readiness)
- `top_fixes`: three concrete, file-path-level recommendations, ordered by
  expected impact

### Strategies

- fetch, never guess — every finding is grounded in a real WebFetch of a
  real URL; a 404 is a finding, not a failure
- probe a fixed, small set of paths so the run is fast and reproducible:
    - always: `/robots.txt`, `/llms.txt`, `/llms-full.txt`, `/sitemap.xml`,
      `/.well-known/ai-plugin.json`, homepage
    - if focus includes product-docs: add `/docs`, `/docs/`, `/api`, `/help`
    - if focus includes public-api: add `/openapi.json`, `/openapi.yaml`,
      `/swagger.json`, `/.well-known/openapi.json`, `/.well-known/mcp.json`,
      `/api/openapi.json`
- for the homepage, fetch the raw HTML and inspect: `<title>`,
  `<meta name="description">`, OpenGraph tags (`og:title`, `og:description`),
  JSON-LD (`<script type="application/ld+json">`), and whether meaningful
  body text is visible in the plain HTML
- never try to execute JavaScript — if the page requires JS to show content,
  that lowers the parseability score, it does not fail the run
- score each applicable dimension 0-100 with brief per-finding evidence:
    - discoverability: robots allows agents, llms.txt present, sitemap
      present
    - parseability: homepage renders content in plain HTML, not JS-wall
    - structure: title, description, OpenGraph, JSON-LD present
    - api_readiness: openapi/mcp endpoints present, docs index linked
- compute overall_score as the equal-weighted mean of applicable
  dimensions; omit dimensions the focus excludes and renormalize
- top_fixes must name the exact file to add or change, not abstract advice;
  bad: "improve discoverability"; good: "add `/llms.txt` at the domain root
  with a 150-word product summary and links to your top three docs pages"
- keep the report short enough to screenshot: one page of findings plus one
  page of raw probe results

### Workflow

1. If any of `company_name`, `domain`, or `focus` is missing, `ask_user`
   for it. Present `focus` as a numbered multi-choice with four options and
   `all` as the default.
2. Normalize `domain` to an origin URL: prepend `https://` if missing, strip
   trailing slash. Derive `<slug>` by lowercasing `company_name` and
   replacing non-alphanumeric runs with `-`.
3. Compute `workspace_dir` as `~/prose-<slug>/`. Create the directory if it
   does not exist.
4. Fetch the fixed probe set for the selected focus via WebFetch. Record
   for each probe: URL, HTTP status (or "fetch failed"), content length,
   and a one-line content summary.
5. Fetch the homepage HTML. Inspect for title, description, OpenGraph tags,
   JSON-LD, and plain-HTML body content. Record findings.
6. Score each applicable dimension 0-100 with one to three pieces of
   evidence per score.
7. Compute `overall_score` as the renormalized mean of applicable dimensions.
8. Choose `top_fixes`: the three highest-impact, lowest-effort changes,
   each naming the exact file to add or change.
9. Write the report to `<workspace_dir>/agent-readiness.md` in the format
   below.
10. Return `workspace_dir`, `report_path`, `overall_score`,
    `dimension_scores`, and `top_fixes`. Print a single summary line:
    `Agent readiness: {overall_score}/100. Report: {report_path}`.

### Errors

- `domain_unreachable`: the homepage returned no response or a 5xx. Ask the
  user to confirm the domain, then stop without producing a score.
- `domain_invalid`: the input could not be normalized to an https URL. Ask
  the user for a cleaner domain.

### Output Format

The written report has this structure:

```markdown
# Agent Readiness Report — {company_name}

**Domain:** {origin}
**Date:** {YYYY-MM-DD}
**Focus:** {focus}
**Overall Score:** {overall_score}/100

## Summary

{2-3 sentence narrative framing the score in terms of what agents can and
cannot do with this domain today}

## Discoverability — {score}/100

- ✓ / ✗ {evidence line}
- ...

## Parseability — {score}/100

- ✓ / ✗ {evidence line}
- ...

## Structure — {score}/100

- ✓ / ✗ {evidence line}
- ...

## API Readiness — {score}/100   (omit if focus excludes it)

- ✓ / ✗ {evidence line}
- ...

## Top 3 Fixes

1. **{exact file path or URL}** — {what to add and why it matters for agents}
2. **{...}** — {...}
3. **{...}** — {...}

## Raw Probe Results

| Path | Status | Summary |
|------|--------|---------|
| /robots.txt | 200 | Allows all user agents |
| /llms.txt | 404 | Not present |
| ... | ... | ... |
```

### Invariants

- Every finding in the report is grounded in a real WebFetch result in the
  Raw Probe Results table. A reader can reproduce every ✓ or ✗ by opening
  the listed path in their own browser.
- The three top_fixes are each executable by a single engineer in under a
  day; no "rearchitect the site" recommendations.
- The run never modifies the target domain and never posts, submits, or
  writes anywhere outside `<workspace_dir>` on the local filesystem.
