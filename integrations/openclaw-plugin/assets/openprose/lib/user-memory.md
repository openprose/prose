---
name: user-memory
kind: service
persist: user
---

requires:
- mode: operation mode -- "teach" (add knowledge), "query" (ask questions from accumulated knowledge), or "reflect" (synthesize understanding of a topic)
- content: what to teach, the question to answer, or the topic to reflect on

ensures:
- result: depends on mode:
    - teach: confirmation of what was learned, with key concepts extracted and categorized
    - query: answer synthesized from accumulated personal knowledge, with confidence level and knowledge gaps identified
    - reflect: structured reflection on the topic including what is known (with confidence), what is uncertain, and what is missing

errors:
- unknown-mode: mode is not one of teach, query, reflect
- empty-content: content is empty or contains no actionable information
- no-knowledge: query or reflect requested but no knowledge has been taught yet

strategies:
- when teaching: extract reusable knowledge (preferences, conventions, patterns, lessons) and categorize by domain (technical, architectural, process, domain-specific)
- when querying: synthesize across all relevant taught knowledge, note confidence levels, and explicitly flag when the answer draws on thin evidence
- when reflecting: organize knowledge by confidence tier (well-established, emerging, speculative) and identify gaps worth filling
- on every invocation: read memory file first to load accumulated context before processing

invariants:
- taught knowledge is never silently discarded; contradictions are flagged and the user's latest teaching takes precedence
- query answers distinguish between taught facts and inferences drawn from taught facts
- the memory file stays well-organized regardless of volume; periodic self-compaction keeps it navigable

Personal knowledge base that persists across all projects. Remembers technical preferences, architectural opinions, coding conventions, lessons learned, and domain knowledge. Uses `persist: user` for durable cross-project persistence at `~/.prose/agents/user-memory/`.
