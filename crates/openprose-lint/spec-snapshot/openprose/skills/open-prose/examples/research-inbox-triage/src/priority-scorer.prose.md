---
name: priority-scorer
kind: function
version: 0.15.0
---

# Priority Scorer

### Description

Scores clustered research items by relevance, novelty, credibility, and urgency.

### Shape

- `self`: score and explain priority
- `prohibited`: assigning owners or writing the final triage report

### Parameters

- `clustered-items`: items grouped into topic clusters with duplicate reasoning
- `active-questions`: research questions, initiatives, or watch areas that
  should influence priority

### Returns

- `priority-ranking`: ranked clusters and items with scores, confidence, and
  short reasoning

### Strategies

- Give explicit confidence when evidence is thin.
- Separate "important later" from "urgent now" so the report does not overload
  researchers with false alarms.
