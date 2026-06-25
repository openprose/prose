---
name: sample-runner
kind: service
version: 0.15.0
---

### Requires

- `program_ideas`: OpenProse program ideas matched to observed operational pain

### Ensures

- `sample_results`: sample output pointers or concise degradation notes for the
  highest-intent program ideas

### Invariants

- Keep sample-generation cost bounded by expected prospect value.
