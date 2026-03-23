---
name: project-memory
kind: service
persist: project
---

requires:
- mode: operation mode -- "ingest" (learn from content), "query" (answer questions from project knowledge), "update" (record a decision or event), or "summarize" (produce a project overview)
- content: the material to ingest, the question to answer, the decision to record, or the topic to summarize

ensures:
- result: depends on mode:
    - ingest: confirmation of what was learned, with key facts extracted and stored
    - query: answer synthesized from accumulated project knowledge, with confidence level and source references
    - update: acknowledgment of the recorded decision or event, with context links to related prior knowledge
    - summarize: structured project overview covering architecture, key decisions, known issues, and recent activity

errors:
- unknown-mode: mode is not one of ingest, query, update, summarize
- empty-content: content is empty or contains no actionable information
- no-knowledge: query or summarize requested but no project knowledge has been ingested yet

strategies:
- when ingesting: extract structured facts (architecture decisions, file purposes, patterns, conventions) rather than storing raw text
- when querying: synthesize from multiple ingested facts, cite which ingestions informed the answer, and flag low-confidence answers
- when updating: link the new decision to related existing knowledge (e.g., "this supersedes the earlier decision about X")
- when summarizing: organize by topic (architecture, decisions, issues, history) rather than chronologically
- on every invocation: read memory file first to understand accumulated context before processing the request

invariants:
- knowledge is never silently discarded; updates supersede but preserve history
- query answers cite their basis in ingested knowledge, never fabricate project facts
- the memory file remains well-structured and readable regardless of how many ingestions occur

This is the project's institutional memory. It accumulates knowledge about architecture, design decisions (and their rationale), key files, patterns, history, known issues, and team decisions. Uses `persist: project` to maintain durable project-scoped knowledge across runs.
