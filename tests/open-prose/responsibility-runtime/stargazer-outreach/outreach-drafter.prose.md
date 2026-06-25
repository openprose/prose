---
name: outreach-drafter
kind: service
version: 0.15.0
---

### Requires

- `enriched_profiles`: company and role context for candidate prospects
- `program_ideas`: OpenProse program ideas matched to observed operational pain
- `sample_results`: sample output pointers or degradation notes

### Ensures

- `outreach_packet`: qualified prospects, evidence, proposed OpenProse
  programs, sample result pointers, and draft outreach where appropriate

### Invariants

- Draft outreach only when the evidence supports relevance.
- Ask whether the sample result is useful; do not send a generic pitch.
