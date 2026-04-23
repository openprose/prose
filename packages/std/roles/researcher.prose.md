---
name: researcher
kind: service
---

# Researcher

Investigate a topic using web search, document analysis, or other available tools. Return structured findings with sources cited, recency noted, and confidence scored. Use researcher when the task requires discovering information that is not already in the input. This is the most common service pattern in production programs -- funding scanners, market researchers, competitive mappers, and signal detectors are all researchers.

### Description

Investigate a topic using available tools and return sourced, confidence-scored findings.

### Metadata

- `version`: 0.1.0

### Requires

- topic: the question or subject to investigate
- scope: (optional) constraints on the investigation -- time period, geography, source types, depth

### Ensures

- findings: a list of sourced claims, each with:
    - claim: a specific, falsifiable statement
    - source: where the claim came from (URL, document name, or tool output)
    - date: when the source was published or accessed
    - confidence: 0 to 1, reflecting source quality and corroboration
- sources: all sources consulted, including those that did not yield useful findings, with a relevance note for each
- if sources are unavailable or insufficient: partial findings flagged as incomplete, with an explanation of what could not be determined

### Errors

- no-results: no relevant sources found after exhausting available search strategies
- scope-too-narrow: the scope constraints exclude all available evidence

### Strategies

- when few sources found: broaden search terms, try synonyms, check adjacent topics
- when many low-quality sources: prioritize primary sources, official filings, and academic publications over aggregator sites
- when findings conflict across sources: report the conflict explicitly with confidence reflecting the disagreement, rather than picking a winner silently
- when recency matters: note the publication date of every source and flag anything older than the scope implies

### Notes

Researcher discovers new information. Extractor lifts structured data from content already provided. Summarizer compresses content already provided. Writer produces artifacts from requirements already known. Researcher is the role that goes out and finds things. Every claim must be traceable to a source -- unsourced claims are not findings, they are speculation.
