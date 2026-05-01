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
    probe:
      pattern: std/patterns/worker-critic
      with:
        worker: writer
        critic: reviewer
      config:
        max_rounds: 2
    analyst: variance-analyst
  config:
    sample_size: 3
```

### Requires

- `task_brief`: combined brief describing the topic and audience for the article
- `criteria`: quality standards the reviewer must enforce
- `material`: source material or constraints to use for the repeated confidence probe

### Ensures

- `result`: variance analysis of repeated reviewed-draft outputs
- `responses`: raw reviewed-draft samples used for the variance analysis

### Notes

This system instantiates two patterns:

1. `worker-critic` uses `writer` as the worker and `reviewer` as the critic.
2. `stochastic-probe` nests its own `worker-critic` instance, runs it repeatedly with identical inputs, and sends the responses to `variance-analyst`.

The confidence score in the output indicates whether the writer produces consistent quality (low variance) or inconsistent results (high variance) for this topic.
