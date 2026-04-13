---
name: content-pipeline-compact
kind: program
services: [review, polish, fact-check]
---

Demonstrates multiple services in a single file using `##` heading delimiters. Each `##` section defines a separate service with its own contract.

requires:
- draft: a piece of writing to review and polish

ensures:
- final: polished text incorporating editorial feedback with all facts verified

## review

requires:
- draft: a piece of writing to review

ensures:
- feedback: specific, actionable editorial notes

## polish

requires:
- draft: the original text
- feedback: editorial notes to incorporate

ensures:
- final: polished text incorporating all feedback

## fact-check

requires:
- text: content containing factual claims

ensures:
- claims: each factual claim with verification status (verified, unverified, disputed)
