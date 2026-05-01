---
name: confident-writer
kind: system
---

# Confident Writer

### Description

Demonstrates nested pattern instances: a writer with review and confidence measurement.

### Services

```yaml
- name: reviewed-draft
  pattern: std/patterns/worker-critic
  with:
    worker: writer
    critic: reviewer
  config:
    max_rounds: 2

- name: confidence-analysis
  pattern: std/patterns/stochastic-probe
  with:
    probe: reviewed-draft
    analyst: variance-analyst
  config:
    sample_size: 3
```

### Requires

- `task_brief`: combined brief describing the topic and audience for the article

### Ensures

- `article`: polished article that has been quality-reviewed and confidence-scored
- `confidence`: variance analysis of repeated reviewed-draft outputs

### Notes

This system instantiates two patterns:

1. `worker-critic` uses `writer` as the worker and `reviewer` as the critic.
2. `stochastic-probe` runs the reviewed draft service repeatedly and sends the responses to `variance-analyst`.

The confidence score in the output indicates whether the writer produces consistent quality (low variance) or inconsistent results (high variance) for this topic.
