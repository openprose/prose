---
name: youtube-analyzer
kind: responsibility
id: 067NC4KG01RG50R40M30E20919
version: 0.15.0
---

# YouTube Comment Sentiment Analyzer

### Goal
Analyze the sentiment of incoming YouTube comments and identify top action items.

### Requires
- `youtube-comments-gateway: comments`

### Maintains
The sentiment breakdown and prioritized complaints. Postcondition: the top 3 complaints citation references must correspond to real comment IDs.

#### sentiment-breakdown
A categorized breakdown of comments into positive, negative, and neutral sentiments.

#### action-items
A prioritized list of the top 3 viewer complaints or action items.

### Continuity
- input-driven
