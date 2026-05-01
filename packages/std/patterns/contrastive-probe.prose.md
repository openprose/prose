---
name: contrastive-probe
kind: pattern
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
  - ensures: diagnostic_profile
- `ranker`
  - requires: profile_a, profile_b, dimension
  - ensures: verdict, magnitude, evidence

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

### Ensures

- The same measurement pattern runs independently on both candidates
- Candidates are measured in isolation — the measurement of A does not influence B
- Ranker receives both diagnostic profiles and the dimension to judge
- Ranker determines:
  - Which candidate scores better on the specified dimension
  - By how much (qualitative magnitude: marginal, clear, decisive)
  - What specifically makes one better than the other
- pattern_instance.result contains the ranker's verdict
- pattern_instance.profile_a contains candidate A's measurement result
- pattern_instance.profile_b contains candidate B's measurement result

### Delegation

```javascript
const {
  measurement, ranker,
  candidate_a, candidate_b,
  label_a = "Candidate A", label_b = "Candidate B",
  dimension
} = pattern_instance;

// Run measurement on candidate A
const profileA = await rlm(null, null, {
  use: measurement,
  config: candidate_a
});

// Run measurement on candidate B
const profileB = await rlm(null, null, {
  use: measurement,
  config: candidate_b
});

// Ranker compares
const rankerBrief = `Two candidates were measured on the same dimension using the same diagnostic instrument.

Dimension: ${dimension}

=== ${label_a.toUpperCase()} — Diagnostic Profile ===
${JSON.stringify(profileA, null, 2)}

=== ${label_b.toUpperCase()} — Diagnostic Profile ===
${JSON.stringify(profileB, null, 2)}

Determine:
1. Which candidate scores BETTER on "${dimension}"?
2. By how much? (marginal / clear / decisive)
3. What specifically makes one better? (cite evidence from the profiles)
4. Are there sub-dimensions where the losing candidate is actually superior?`;

const verdict = await rlm(rankerBrief, null, { use: ranker });

pattern_instance.result = verdict;
pattern_instance.profile_a = profileA;
pattern_instance.profile_b = profileB;
return(verdict);
```

### Notes

This is a seed pattern and a meta-pattern — it combines over other measurement patterns rather than implementing its own measurement logic. The ranker does not know it is part of a contrastive probe. The measurement pattern does not know it is being used comparatively.

The value is in making qualitative comparisons empirical. "Which of these two prompts is clearer?" is a subjective question. "Which of these two prompts produces a higher cross-tier agreement score on blind-review?" is a measurable one. Contrastive probe turns any measurement pattern into a comparator, enabling:

- **Prompt A/B testing**: which prompt is more deterministic (via stochastic-probe)?
- **Documentation quality comparison**: which version is clearer (via blind-review)?
- **API surface ranking**: which interface has fewer hidden assumptions (via assumption-miner)?
- **Vendor evaluation**: which provider's documentation drifts less from their actual API behavior (via coherence-probe)?

The meta-pattern pattern also means new measurement patterns automatically become available as contrastive dimensions without any additional work.
