---
name: composed-reviewer
kind: program
---

### Description

Demonstrates Level 1 composite instantiation — a writer with worker-critic review.

### Services

- `reviewed-draft`: `composites/worker-critic`
  - `worker`: `writer`
  - `critic`: `reviewer`
  - `max_rounds`: 2

### Requires

- `task_brief`: Markdown<TaskBrief> - a combined brief describing the topic and audience for the article

### Ensures

- `article`: Markdown<Article> - a polished article that has passed quality review


### Effects

- `pure`: deterministic transformation over declared inputs
