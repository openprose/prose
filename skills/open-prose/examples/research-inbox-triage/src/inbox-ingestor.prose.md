---
name: inbox-ingestor
kind: service
---

# Inbox Ingestor

### Description

Normalizes raw inbox submissions into compact item records that downstream
triage services can compare.

### Shape

- `self`: normalize item metadata, extract source clues, identify obvious
  duplicates in the submitted batch
- `prohibited`: ranking long-term importance or assigning owners

### Requires

- `inbox_items`: new papers, links, notes, or questions awaiting triage

### Ensures

- `normalized_items`: cleaned item records with title, source, submitted note,
  received timestamp when known, and extracted tags
- `batch_duplicate_hints`: likely duplicates within this batch, with the reason
  they appear related

### Strategies

- Preserve uncertainty rather than filling in missing author, date, or source
  fields.
- Treat near-identical URLs, titles, and abstracts as duplicate hints, not final
  duplicate decisions.
