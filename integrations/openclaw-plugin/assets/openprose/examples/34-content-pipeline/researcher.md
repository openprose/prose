---
name: researcher
kind: service
shape:
  self: [find sources, extract facts, identify angles]
  prohibited: [writing articles, creating social media content]
---

requires:
- topic: the topic to research

ensures:
- research-brief: unified research covering current state of the art, competitive landscape, and human interest stories
- each claim: has a citation
- narrative-suggestions: potential hooks, angles, and headline ideas
