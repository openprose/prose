---
name: coherence-probe
kind: composite
---

# Coherence Probe

Two corpora that should describe the same system are read independently. Agents that read corpus A predict what corpus B should say, and vice versa. Where predictions fail, the corpora have drifted.

### Description

Detects drift between two corpora by having independent readers predict what the counterpart should say, then classifying where predictions fail.

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
- `corpus_a` (string, default: none): First corpus to compare
- `corpus_b` (string, default: none): Second corpus to compare
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

- &compositeState exists at __compositeState with:
    reader: string            -- component name for reader agents
    sync_analyst: string      -- component name for the sync analyst
    corpus_a: string          -- first corpus (e.g. the code)
    corpus_b: string          -- second corpus (e.g. the documentation)
    label_a: string           -- (optional, default "Corpus A") human label for corpus A
    label_b: string           -- (optional, default "Corpus B") human label for corpus B
    readers_per_direction: number -- (optional, default 3) agents per direction

### Ensures

- Readers of corpus A never see corpus B, and vice versa
- Each reader builds understanding from its assigned corpus, then predicts what the counterpart corpus should contain
- Sync analyst receives predictions alongside actuals and classifies each discrepancy:
  - Stale: corpus B once matched corpus A but has not been updated (common with docs)
  - Undocumented: corpus A describes behavior that corpus B does not mention at all
  - Contradictory: both corpora address the same topic but make incompatible claims
  - Redundant divergence: both say the same thing differently — not a real drift, just style
- Analysis is BIDIRECTIONAL — drift from A→B is a different finding than drift from B→A
- &compositeState.result contains the sync analyst's bidirectional drift report
- &compositeState.predictions contains raw predictions from both directions

### Delegation Loop

```javascript
const {
  reader, sync_analyst, corpus_a, corpus_b,
  label_a = "Corpus A", label_b = "Corpus B",
  readers_per_direction = 3
} = __compositeState;

const predictions = { a_predicts_b: [], b_predicts_a: [] };

// Direction 1: readers of A predict B
for (let i = 0; i < readers_per_direction; i++) {
  const brief = `You are reading ${label_a}. Study it carefully, then predict what ${label_b} should contain if the two are in sync.

${label_a}:
${corpus_a}

Based on your reading, describe what you expect ${label_b} to say. Be specific — list the claims, behaviors, interfaces, or rules you expect to find documented there.`;

  const prediction = await rlm(brief, null, { use: reader });
  predictions.a_predicts_b.push(prediction);
}

// Direction 2: readers of B predict A
for (let i = 0; i < readers_per_direction; i++) {
  const brief = `You are reading ${label_b}. Study it carefully, then predict what ${label_a} should contain if the two are in sync.

${label_b}:
${corpus_b}

Based on your reading, describe what you expect ${label_a} to say. Be specific — list the claims, behaviors, interfaces, or rules you expect to find there.`;

  const prediction = await rlm(brief, null, { use: reader });
  predictions.b_predicts_a.push(prediction);
}

// Sync analyst compares predictions to actuals in both directions
const analystBrief = `Two corpora — "${label_a}" and "${label_b}" — should describe the same system. Agents read one corpus and predicted what the other should contain. Compare their predictions to the actual content.

=== DIRECTION 1: ${label_a} readers predict ${label_b} ===
Predictions (what ${label_a} readers expect ${label_b} to say):
${predictions.a_predicts_b.map((p, i) => `--- Reader ${i + 1} ---\n${p}`).join("\n\n")}

Actual ${label_b}:
${corpus_b}

=== DIRECTION 2: ${label_b} readers predict ${label_a} ===
Predictions (what ${label_b} readers expect ${label_a} to say):
${predictions.b_predicts_a.map((p, i) => `--- Reader ${i + 1} ---\n${p}`).join("\n\n")}

Actual ${label_a}:
${corpus_a}

For each discrepancy between prediction and actual, classify:
- STALE: the prediction matches an older version of the actual — drift from a formerly-synced state
- UNDOCUMENTED: one corpus describes something the other omits entirely
- CONTRADICTORY: both address the same topic with incompatible claims
- REDUNDANT DIVERGENCE: both say the same thing differently — style, not substance

Report findings bidirectionally. "${label_a} says X but ${label_b} says Y" is a different finding from "${label_b} says Y but ${label_a} says X."`;

const analysis = await rlm(analystBrief, null, { use: sync_analyst });

__compositeState.result = analysis;
__compositeState.predictions = predictions;
return(analysis);
```

### Notes

This is a seed pattern. Readers of one corpus never see the other — their predictions are based entirely on what they read. The sync analyst does not know it is part of a coherence probe. The structural insight is that *prediction failure is more informative than direct comparison*. A diff between two documents tells you they differ. A prediction failure tells you they differ *in ways that a reader of one would not expect given the other* — which is the meaningful kind of drift. Two documents can differ extensively in wording while remaining synchronized, and they can appear similar while harboring subtle contradictions. The prediction layer catches the latter.
