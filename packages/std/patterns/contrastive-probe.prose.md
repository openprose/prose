---
name: contrastive-probe
kind: pattern
version: 0.15.0
---

# Contrastive Probe

A meta-pattern. Run any read-only measurement on two candidate artifacts, then rank which scores better on the measured dimension.

### Description

Runs any measurement pattern on two candidates independently, then ranks which scores better on the measured dimension.

### Metadata

- `version`: 0.1.0

### Slots

- `measurement` (primary)
  - requires: candidate_config
  - maintains: diagnostic_profile
- `ranker`
  - requires: profile_a, profile_b, dimension
  - maintains: verdict, magnitude, evidence

### Config

- `dimension` (string, default: none): The quality being compared (e.g. "clarity", "determinism", "assumption count")
- `candidate_a` (string, default: none): First candidate configuration
- `candidate_b` (string, default: none): Second candidate configuration
- `label_a` (string, default: Candidate A): Human label for the first candidate
- `label_b` (string, default: Candidate B): Human label for the second candidate

### Invariants

- The same measurement pattern runs on both candidates
- Candidates are measured in isolation — measurement of A does not influence B

### Shape

- `self`: run the same measurement pattern on candidate A and candidate B, delegate ranking
- `delegates`:
  - `measurement`: any read-only measurement pattern — blind-review, stochastic-probe, assumption-miner, etc.
  - `ranker`: given two diagnostic profiles, determine which candidate is superior on the measured dimension
- `prohibited`: none

### Requires

- Pattern instance receives:
    measurement: string       -- service or system name for the measurement pattern to use
    ranker: string            -- service or system name for the ranker
    candidate_a: object       -- pattern instance config for measuring candidate A (passed to measurement pattern)
    candidate_b: object       -- pattern instance config for measuring candidate B (passed to measurement pattern)
    label_a: string           -- (optional, default "Candidate A")
    label_b: string           -- (optional, default "Candidate B")
    dimension: string         -- what is being compared (e.g. "clarity", "determinism", "assumption count")

### Maintains

- The same measurement pattern runs independently on both candidates
- Candidates are measured in isolation — the measurement of A does not influence B
- Ranker receives both diagnostic profiles and the dimension to judge
- Ranker determines:
  - Which candidate scores better on the specified dimension
  - By how much (qualitative magnitude: marginal, clear, decisive)
  - What specifically makes one better than the other
- `result`: the ranker's verdict
- `profile_a`: candidate A's measurement result
- `profile_b`: candidate B's measurement result

### Delegation

```prose
parallel:
  let profile_a = call measurement
    candidate_config: candidate_a
    label: label_a

  let profile_b = call measurement
    candidate_config: candidate_b
    label: label_b

let result = call ranker
  profile_a: profile_a
  profile_b: profile_b
  dimension: dimension
  prompt: "Choose the better candidate, magnitude, evidence, and any sub-dimensions where the losing candidate is stronger."

return {
  result: result,
  profile_a: profile_a,
  profile_b: profile_b
}
```

### Notes

This is a seed pattern and a meta-pattern — it combines over other measurement patterns rather than implementing its own measurement logic. The ranker does not know it is part of a contrastive probe. The measurement pattern does not know it is being used comparatively.

The value is in making qualitative comparisons empirical. "Which of these two prompts is clearer?" is a subjective question. "Which of these two prompts produces a higher cross-tier agreement score on blind-review?" is a measurable one. Contrastive probe turns any measurement pattern into a comparator, enabling:

- **Prompt A/B testing**: which prompt is more deterministic (via stochastic-probe)?
- **Documentation quality comparison**: which version is clearer (via blind-review)?
- **API surface ranking**: which interface has fewer hidden assumptions (via assumption-miner)?
- **Vendor evaluation**: which provider's documentation drifts less from their actual API behavior (via coherence-probe)?

The meta-pattern pattern also means new measurement patterns automatically become available as contrastive dimensions without any additional work.
