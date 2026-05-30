---
name: run-research
kind: service
---

# Run Research

### Description

Invoke the public `grant-finder` CLI as a subprocess, passing the resolved
Research Assignment on stdin and reading the Research Packet from stdout. The
CLI does the work; this service just bridges JSON across the process boundary.

### Requires

- `research_assignment`: schema-valid Research Assignment JSON from
  `resolve-assignment`

### Ensures

- `research_packet`: the deterministic Research Packet returned by
  `grant-finder research --json`. The packet includes:
  - `assignment_id`
  - `retrieval`: backend used (`usearch`, `fts5`, or fallback) and the
    constructed query
  - `summary`: high-fit count, nearest deadline, total potential funding
  - `grants`: retrieval-ordered candidate opportunities with `recommendation_id`,
    `opportunity_id`, `program_name`, `agency`, `amount`, `deadline`,
    `deadline_certainty`, `eligibility_fit`, `effort_estimate`,
    `activity_status`, `url`, `application_outline`, and `evidence`
  - `coverage`: per-source-lane status rows including negative evidence for
    must-check lanes (e.g., ARPA-E)

### Skills

- grant-finder

### Shape

- `self`: shell out to the `grant-finder` binary, pass the assignment via
  stdin, capture stdout, parse JSON, publish the packet
- `prohibited`: editing or filtering the packet before publishing it (downstream
  services can format or summarize, but this service must not silently drop
  records); calling any LLM with the assignment contents; writing the assignment
  to a path under user control beyond the CLI's own ledger

### Strategies

- Resolve the binary path from `$GRANT_FINDER_BIN` if set, otherwise the first
  `grant-finder` on `PATH`. If neither resolves, fail with a clear message
  naming the binary and pointing at `## Prerequisites` in the top-level
  `grant-radar` system.
- Invoke as:
  ```bash
  grant-finder research \
    --assignment - \
    --refresh auto \
    --semantic auto \
    --json
  ```
  Pipe `research_assignment` JSON into stdin. Pass `--db "$GRANT_FINDER_DB"`
  when that environment variable is set.
- The CLI may take 5–60 seconds for a cold ledger that needs to refresh. That
  is the CLI's deterministic work, not an LLM hop. Stream stderr so progress
  is visible without blocking on it.
- If the CLI exits non-zero, capture both the exit code and stderr in the
  failure message and surface them as-is. Do not paraphrase the CLI's error.
- Validate that the returned packet has `retrieval.no_llm == true`. The CLI
  must not have called an LLM internally; if that field is missing or false,
  fail before publishing.
