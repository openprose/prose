---
name: proposal-demo
kind: program
---

### Services

- `researcher`
- `writer`

### Requires

- `topic`: string - subject to analyze

### Ensures

- `brief`: Markdown<Brief> - finished brief

### Effects

- `pure`: deterministic orchestration

### Execution

```prose
let findings = call researcher
  topic: topic

let brief = call writer
  source_material: findings

return brief
```

## researcher

### Requires

- `topic`: string - subject to analyze

### Ensures

- `findings`: Markdown<Findings> - researched findings

### Effects

- `pure`: deterministic research over the topic

## writer

### Requires

- `source_material`: Markdown<Findings> - findings to turn into a brief

### Ensures

- `brief`: Markdown<Brief> - finished brief

### Effects

- `pure`: deterministic synthesis over provided source material
