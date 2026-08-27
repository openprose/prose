---
name: architecture-elicitor
kind: function
version: 0.16.0
---

# Architecture Elicitor

Ask only the questions needed to make meaningful architectural progress.

### Parameters

- `frontier`: at most three active architectural concepts
- `exploration`: orthogonal options and tradeoffs
- `mental_model_sync`: compact shared model and selective recall prompts
- `current`: current architecture
- `landscape`: local facts
- `interactive`: whether questions are available

### Returns

- `elicitation`: accepted answers, decisions resolved, new constraints,
  remaining open questions, blocking missing decisions, and retry hint

### Strategies

- Begin a new architecture with: “What should be true after this program runs
  that was not true before?”
- Ask the highest-leverage question first.
- Do not ask for confirmation of a settled decision. Materialize its next
  reversible consequence and then surface the next genuinely unresolved
  decision.
- Every question must identify what downstream architecture its answer unlocks.
  If no meaningful branch closes or action becomes possible, do not ask it.
- Prefer mutually exclusive options that divide the remaining design space,
  with the recommended option first and a short consequence for each.
- Allow the architect to reject the partition and restate the concept.
- Use recall prompts only when the present decision depends on them.
- Ask follow-ups about boundaries, not implementation trivia.
- If interaction is unavailable, preserve the ranked gaps and return a useful
  retry hint rather than guessing.
- The user may say “provisional”; record the answer as an assumption rather
  than a decision.

---

## mental-model-synchronizer

Restore a compact shared model before asking the architect to decide.

### Parameters

- `current`: current architecture and constraint lattice
- `frontier`: active and deferred concepts
- `exploration`: orthogonal exploration results

### Returns

- `mental_model_sync`: concise statement of:
    - current system purpose and desired render
    - current zoom level and path
    - load-bearing settled constraints relevant now
    - what the exploration clarified or challenged
    - active options and their real tradeoff
    - deferred concepts that remain untouched
- `recall_prompts`: earlier constraints worth resurfacing now because they are
  load-bearing, contradicted, or at risk of mental-model drift

### Invariants

- Sync is short enough to hold in working memory.
- Do not repeat the whole architecture.
- Spaced repetition is selective recall, not ritual repetition.
