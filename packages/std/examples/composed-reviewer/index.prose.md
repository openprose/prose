---
name: composed-reviewer
kind: system
---

### Description

Demonstrates a pattern instance: a writer with worker-critic review.

### Services

```yaml
- name: reviewed-draft
  pattern: std/patterns/worker-critic
  with:
    worker: writer
    critic: reviewer
  config:
    max_rounds: 2
```

### Requires

- `task_brief`: combined brief describing the topic and audience for the article

### Ensures

- `article`: polished article that has passed quality review
