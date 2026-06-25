---
name: program-proposer
kind: service
version: 0.15.0
---

### Requires

- `enriched_profiles`: company and role context for candidate prospects

### Ensures

- `program_ideas`: OpenProse program ideas matched to observed operational
  pain, with a short reason each idea may be useful

### Invariants

- Do not propose generic automation without evidence from the profile.
