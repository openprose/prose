---
name: user-memory
kind: service
version: 0.1.0
description: Persistent cross-project knowledge store for personal preferences, conventions, and lessons.
persist: user
---

# User Memory

## Description

Personal knowledge base that persists across all projects. Remembers technical preferences, architectural opinions, coding conventions, lessons learned, and domain knowledge. Uses `persist: user` for durable cross-project persistence at `~/.prose/agents/user-memory/`.

User memory uses learning vocabulary (teach, reflect) because it handles personal knowledge and preferences — things the user has experienced, decided, or learned. Compare with project-memory, which uses data vocabulary (ingest, update) because it handles documents and facts.

## Contract

### requires:
- mode: operation mode — one of `teach` (add knowledge), `query` (ask questions from accumulated knowledge), `update` (correct or revise existing knowledge), or `reflect` (synthesize understanding of a topic)
- content: what to teach or the correction to apply (required for teach and update modes)
- query: the question to answer or the topic to reflect on (required for query and reflect modes)

### ensures:
- result: depends on mode:
    - teach: confirmation of what was learned, with key concepts extracted and categorized
    - query: answer synthesized from accumulated personal knowledge, with confidence level and knowledge gaps identified
    - update: acknowledgment of the correction, with what was changed and what prior knowledge was revised
    - reflect: structured reflection on the topic including what is known (with confidence), what is uncertain, and what is missing

### errors:
- unknown-mode: mode is not one of teach, query, update, reflect
- empty-content: content is empty or contains no actionable information
- no-knowledge: query or reflect requested but no knowledge has been taught yet
- knowledge-not-found: query targets a specific topic for which no knowledge exists
- already-known: advisory (not blocking) — the taught knowledge is already present and unchanged; acknowledged but no state change occurs
- contradicts-prior: new teaching contradicts existing knowledge; requires resolution (default: latest teaching wins, but the conflict is recorded)

### strategies:
- knowledge conflict resolution: the user's latest teaching takes precedence by default; when conflict is detected, record both versions with timestamps and note the resolution
- knowledge aging: flag entries that have not been referenced or reinforced within a configurable staleness window; stale entries are never deleted but are demoted in query relevance
- confidence calibration: answers to queries carry a confidence level (high, medium, low) based on how directly and recently the knowledge was taught
- when teaching: extract reusable knowledge (preferences, conventions, patterns, lessons) and categorize by domain (technical, architectural, process, domain-specific)
- when querying: synthesize across all relevant taught knowledge, note confidence levels, and explicitly flag when the answer draws on thin evidence
- when updating: link the correction to the original teaching; record what changed and why
- when reflecting: organize knowledge by confidence tier (well-established, emerging, speculative) and identify gaps worth filling
- on every invocation: read memory file first to load accumulated context before processing

### invariants:
- never loses explicitly taught knowledge unless explicitly told to forget
- taught knowledge is never silently discarded; contradictions are flagged and the user's latest teaching takes precedence
- query answers distinguish between taught facts and inferences drawn from taught facts
- never forgets explicit corrections delivered via update mode
- the memory file stays well-organized regardless of volume; periodic self-compaction keeps it navigable

## Notes

User memory and project memory are siblings in the standard library, but they use different mode vocabularies by design.

**Why the modes differ from project-memory:** Project memory uses data vocabulary (ingest/update/summarize) because it handles documents and facts — material deposited from external sources into a shared knowledge base. User memory uses learning vocabulary (teach/update/reflect) because it handles personal knowledge and preferences — things the user has experienced, decided, or wants remembered. "Teach me that X" is natural for a personal knowledge store in a way that "ingest X" is not. Both share `query` and `update` because those operations are conceptually identical across both scopes.

The `already-known` error is advisory, not blocking. A caller that teaches something the system already knows receives an acknowledgment rather than a failure. The `contradicts-prior` error triggers the conflict resolution strategy — by default, the latest teaching wins, but the conflict is always recorded so it can be reviewed.
