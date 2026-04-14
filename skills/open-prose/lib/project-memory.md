---
name: project-memory
kind: service
version: 0.1.0
description: Persistent project-scoped knowledge store for architecture, decisions, patterns, and history.
persist: project
---

# Project Memory

## Description

The project's institutional memory. It accumulates knowledge about architecture, design decisions (and their rationale), key files, patterns, history, known issues, and team decisions. Uses `persist: project` to maintain durable project-scoped knowledge across runs at `.prose/agents/project-memory/`.

Project memory uses data vocabulary (ingest, update) because it handles documents and facts — material that is deposited into the system from external sources. Compare with user-memory, which uses learning vocabulary (teach, reflect) because it handles personal knowledge and preferences.

## Contract

### requires:
- mode: operation mode — one of `ingest` (deposit new content), `query` (answer from accumulated knowledge), `update` (record a decision or correct existing knowledge), or `summarize` (produce a project overview)
- content: the material to ingest or update (required for ingest and update modes)
- query: the question to answer or topic to summarize (required for query and summarize modes)

### ensures:
- result: depends on mode:
    - ingest: confirmation of what was learned, with key facts extracted and stored
    - query: answer synthesized from accumulated project knowledge, with confidence level and source references
    - update: acknowledgment of the recorded change, with context links to related prior knowledge and what was superseded
    - summarize: structured project overview covering architecture, key decisions, known issues, and recent activity

### errors:
- unknown-mode: mode is not one of ingest, query, update, summarize
- empty-content: content is empty or contains no actionable information
- no-knowledge: query or summarize requested but no project knowledge has been ingested yet
- knowledge-not-found: query targets a specific topic for which no knowledge exists
- conflicting-knowledge: new information contradicts existing knowledge and no resolution strategy was provided

### strategies:
- knowledge conflict resolution: newer sources win unless the ingestion explicitly marks older knowledge as authoritative; when conflict is detected, record both versions with timestamps and flag the conflict for review
- knowledge aging: flag entries that have not been referenced or updated within a configurable staleness window; stale entries are never deleted but are demoted in query relevance
- confidence calibration: answers to queries carry a confidence level (high, medium, low) based on the volume, recency, and consistency of supporting knowledge
- when ingesting: extract structured facts (architecture decisions, file purposes, patterns, conventions) rather than storing raw text
- when querying: synthesize from multiple ingested facts, cite which ingestions informed the answer, and flag low-confidence answers
- when updating: link the new knowledge to related existing entries; record what was superseded and why
- when summarizing: organize by topic (architecture, decisions, issues, history) rather than chronologically
- on every invocation: read memory file first to understand accumulated context before processing the request

### invariants:
- never loses explicitly ingested knowledge unless explicitly told to remove it
- knowledge is never silently discarded; updates supersede but preserve history
- query answers cite their basis in ingested knowledge; never fabricate project facts not grounded in ingested content
- never forgets explicit corrections delivered via update mode
- the memory file remains well-structured and readable regardless of how many ingestions occur

## Notes

Project memory is one of two standard library memory services. It is scoped to a single project directory and persists across runs within that project. Its sibling, user-memory, persists across all projects at the user level.

The mode vocabulary (ingest/query/update/summarize) uses data-processing terms deliberately. Projects accumulate documents, decisions, and facts from multiple contributors and sources — the vocabulary reflects that these are deposits into a shared knowledge base, not personal lessons.
