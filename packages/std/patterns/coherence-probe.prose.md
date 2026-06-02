---
name: coherence-probe
kind: pattern
---

# Coherence Probe

Two corpora that should describe the same system are read independently. Readers that study corpus A predict what corpus B should say, and vice versa. Where predictions fail, the corpora have drifted.

### Description

Detects drift between two corpora by having independent readers predict what the counterpart should say, then classifying where predictions fail.

When instantiated and expanded into nodes, the pattern guarantees:

- Each reader builds understanding from its assigned corpus, then predicts what the counterpart corpus should contain.
- The sync analyst receives predictions alongside actuals and classifies each discrepancy:
  - Stale: corpus B once matched corpus A but has not been updated (common with docs)
  - Undocumented: corpus A describes behavior that corpus B does not mention at all
  - Contradictory: both corpora address the same topic but make incompatible claims
  - Redundant divergence: both say the same thing differently — not a real drift, just style
- Analysis is BIDIRECTIONAL — drift from A→B is a different finding than drift from B→A.

The expansion returns `result` (the sync analyst's bidirectional drift report) and `predictions` (the raw predictions from both directions).

### Metadata

- `version`: 0.1.0

### Slots

- `reader` (primary)
  - requires: corpus, counterpart_label
  - ensures: prediction
- `sync_analyst`
  - requires: predictions, actuals, labels
  - ensures: bidirectional_drift_report

### Config

- `readers_per_direction` (number, default: 3): How many independent readers per direction (A→B and B→A)
- `label_a` (string, default: Corpus A): Human label for the first corpus
- `label_b` (string, default: Corpus B): Human label for the second corpus

### Invariants

- Readers of corpus A never see corpus B, and vice versa
- Analysis is bidirectional — A→B drift is a separate finding from B→A drift

### Shape

- `self`: assign readers to each corpus, collect predictions, compare predictions to actuals
- `delegates`:
  - `reader`: build understanding from one corpus, predict what the other should say
  - `sync_analyst`: compare predictions to actuals in both directions, classify drift
- `prohibited`: none

### Requires

- Pattern instance receives:
    reader: string            -- service or system name for reader services
    sync_analyst: string      -- service or system name for the sync analyst
    corpus_a: string          -- first corpus (e.g. the code)
    corpus_b: string          -- second corpus (e.g. the documentation)
    label_a: string           -- (optional, default "Corpus A") human label for corpus A
    label_b: string           -- (optional, default "Corpus B") human label for corpus B
    readers_per_direction: number -- (optional, default 3) reader instances per direction

### Delegation

```prose
parallel:
  let a_predicts_b = repeat readers_per_direction:
    call reader
      corpus: corpus_a
      counterpart_label: label_b
      prompt: "Read only corpus A, then predict what corpus B should contain if both are in sync."

  let b_predicts_a = repeat readers_per_direction:
    call reader
      corpus: corpus_b
      counterpart_label: label_a
      prompt: "Read only corpus B, then predict what corpus A should contain if both are in sync."

let predictions = {
  a_predicts_b: a_predicts_b,
  b_predicts_a: b_predicts_a
}

let result = call sync_analyst
  predictions: predictions
  actuals: {
    corpus_a: corpus_a,
    corpus_b: corpus_b
  }
  labels: {
    label_a: label_a,
    label_b: label_b
  }
  prompt: "Classify bidirectional discrepancies as stale, undocumented, contradictory, or redundant divergence."

return {
  result: result,
  predictions: predictions
}
```

### Notes

This is a seed pattern. Readers of one corpus never see the other — their predictions are based entirely on what they read. The sync analyst does not know it is part of a coherence probe. The structural insight is that *prediction failure is more informative than direct comparison*. A diff between two documents tells you they differ. A prediction failure tells you they differ *in ways that a reader of one would not expect given the other* — which is the meaningful kind of drift. Two documents can differ extensively in wording while remaining synchronized, and they can appear similar while harboring subtle contradictions. The prediction layer catches the latter.
