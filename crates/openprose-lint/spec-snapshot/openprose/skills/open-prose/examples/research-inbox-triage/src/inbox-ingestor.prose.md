---
name: inbox-ingestor
kind: function
version: 0.15.0
---

# Inbox Ingestor

### Description

Normalizes raw inbox submissions into compact item records that downstream
triage steps can compare.

### Shape

- `self`: normalize item metadata, extract source clues, identify obvious
  duplicates in the submitted batch
- `prohibited`: ranking long-term importance or assigning owners

### Parameters

- `inbox-items`: new papers, links, notes, or questions awaiting triage

### Returns

- `normalized-items`: cleaned item records with title, source, submitted note,
  received timestamp when known, and extracted tags
- `batch-duplicate-hints`: likely duplicates within this batch, with the reason
  they appear related

### Strategies

- Preserve uncertainty rather than filling in missing author, date, or source
  fields.
- Treat near-identical URLs, titles, and abstracts as duplicate hints, not final
  duplicate decisions.
