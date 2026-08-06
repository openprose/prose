---
name: grill
kind: responsibility
version: 0.15.0
---

# Grill

> An intentionally interactive responsibility. It pauses mid-run to ask the
> operator a concrete question that cannot be grounded in repository evidence,
> then uses the answer to produce a grilling brief. This is the counter-example
> to `auto-pocock`: where `auto-pocock` recommends answers to avoid prompting,
> `grill` deliberately leaves required inputs unbound so the VM fires `ask_user`.

### Requires

- `feature-brief`: the original feature idea to challenge. If supplied via CLI
  arg or config, the run proceeds without pausing. If **unbound**, the VM
  pauses and prompts the operator for it via `ask_user`.
- `target-repo`: the repository to inspect for evidence. If supplied, the
  grilling grounds its recommendations in repo evidence. If **unbound**, the
  VM pauses and prompts the operator for it via `ask_user`.

### Maintains

The grilling brief, as this responsibility's maintained truth:

- `challenge-report`: a focused challenge report with questions, why they matter,
  recommended answers grounded in repo evidence, risks, terminology corrections,
  and unresolved unknowns.
- `decision-records`: a numbered list of `{question, recommended_answer,
  confidence, source, residual_risk}` where `source` is one of `brief`, `repo`,
  or `unresolved`.
- `terminology-glossary`: resolved domain terms with avoid-aliases, conflicts
  flagged against the existing glossary.

### Continuity

input-driven: the grilling re-renders when `feature-brief` or `target-repo`
changes. A re-run with the same inputs and no repo change moves nothing, so the
memo key is a **hit** and the responsibility memo-**skips**.

### Shape

- `self`: challenge the plan, inspect the repository for discoverable answers,
  recommend answers, and identify unresolved questions that require human judgment
- `prohibited`: making final product or implementation decisions, opening issues,
  or inventing evidence when the repo cannot ground an answer

### Strategies

- Convert every would-be user question into a `decision-records` entry with a
  recommended answer, confidence, source, and residual risk.
- If a question can be answered from the repository, mark `source: repo` and
  cite the file; otherwise mark `source: brief` or `source: unresolved`.
- Use the existing domain glossary as the starting vocabulary; flag drift instead
  of inventing terms.
- When a term is resolved, capture the resolution in `terminology-glossary` so
  a downstream synthesis can commit it.

### Execution

1. Read the `feature-brief` and `target-repo` inputs.
2. Inspect the repository for evidence that grounds the questions in the brief.
3. For each ambiguity, produce a `decision-records` entry with a recommended
   answer, confidence, source, and residual risk.
4. If a question cannot be grounded in evidence and confidence is below the
   threshold, mark it `source: unresolved` so the operator can decide.
5. Write `challenge-report`, `decision-records`, and `terminology-glossary` to
   the world-model and sign the receipt.
