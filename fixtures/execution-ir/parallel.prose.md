---
name: parallel-demo
kind: program
---

### Services

- `first-worker`
- `second-worker`
- `joiner`

### Requires

- `topic`: string - topic to brief

### Ensures

- `brief`: Markdown<Brief> - returned brief

### Execution

```prose
parallel:
  let first = call first-worker
    topic: topic

  let second = call second-worker
    topic: topic

let brief = call joiner
  first: first
  second: second

return brief
```

## first-worker

### Requires

- `topic`: string - topic to brief

### Ensures

- `first`: Markdown<Brief> - first result

## second-worker

### Requires

- `topic`: string - topic to brief

### Ensures

- `second`: Markdown<Brief> - second result

## joiner

### Requires

- `first`: Markdown<Brief> - first result
- `second`: Markdown<Brief> - second result

### Ensures

- `brief`: Markdown<Brief> - joined result
