---
name: composite-demo
kind: program
---

### Services

- `reviewed-draft`: `worker-critic`
  - `worker`: `writer`
  - `critic`: `reviewer`
  - `max_rounds`: 2

### Requires

- `task_brief`: Markdown<TaskBrief> - task to complete

### Ensures

- `article`: Markdown<Article> - final article

### Effects

- `pure`: deterministic composition
