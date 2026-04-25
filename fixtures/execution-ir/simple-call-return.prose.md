---
name: simple-call-return
kind: program
---

### Services

- `worker`

### Requires

- `topic`: string - topic to brief

### Ensures

- `brief`: Markdown<Brief> - returned brief

### Execution

```prose
let brief = call worker
  topic: topic

return brief
```

## worker

### Requires

- `topic`: string - topic to brief

### Ensures

- `brief`: Markdown<Brief> - returned brief

### Effects

- `pure`: deterministic transform
