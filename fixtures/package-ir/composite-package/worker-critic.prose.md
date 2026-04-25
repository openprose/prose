---
name: worker-critic
kind: composite
---

### Requires

- `task_brief`: Markdown<TaskBrief> - task to complete

### Ensures

- `article`: Markdown<Article> - final article

### Effects

- `pure`: deterministic composite
