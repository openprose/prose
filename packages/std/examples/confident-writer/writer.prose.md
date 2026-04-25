---
name: writer
kind: service
---

### Description

Produce a well-structured article on a given topic for a specified audience.

### Metadata

- `version`: 0.1.0

### Requires

- `task_brief`: Markdown<TaskBrief> - a combined brief describing the topic and audience for the article

### Ensures

- `output`: Markdown<Output> - a clear, well-structured article based on the brief


### Effects

- `pure`: deterministic transformation over declared inputs

### Strategies

- open with a hook that connects the topic to the audience's concerns
- use specific examples and named references rather than generic statements
- keep paragraphs short and scannable
