---
name: prosescript-subagent
kind: service
---

### Requires

- `draft`: Markdown<Draft> - source draft to inspect

### Ensures

- `message`: Markdown<Message> - parent-authored summary from private child notes

### Effects

- `pure`: deterministic synthesis

### Execution

```prose
session `draft-review`:
  call openprose_subagent
    task: "Review the draft and write notes under private state"
try:
  call `draft-review`
finally:
  return `message`
```
