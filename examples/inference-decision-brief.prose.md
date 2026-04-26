---
name: inference-decision-brief
kind: program
---

### Services

- `evidence-extractor`
- `risk-synthesizer`
- `decision-brief-writer`

### Requires

- `decision_question`: Markdown<Question> - the decision the operator needs help making
- `raw_signals`: Markdown<Signals> - pasted notes, evidence, customer comments, metrics, or observations

### Ensures

- `evidence_map`: Markdown<EvidenceMap> - structured evidence grouped by claim, source, and confidence
- `risk_register`: Markdown<RiskRegister> - risks, unknowns, and follow-up checks implied by the evidence
- `decision_brief`: Markdown<DecisionBrief> - concise recommendation with rationale and next actions

### Effects

- `pure`: synthesis over caller-provided notes

## evidence-extractor

### Requires

- `decision_question`: Markdown<Question> - the decision the operator needs help making
- `raw_signals`: Markdown<Signals> - pasted notes, evidence, customer comments, metrics, or observations

### Ensures

- `evidence_map`: Markdown<EvidenceMap> - structured evidence grouped by claim, source, and confidence

### Effects

- `pure`: extracts and normalizes evidence from declared inputs

## risk-synthesizer

### Requires

- `decision_question`: Markdown<Question> - the decision the operator needs help making
- `evidence_map`: Markdown<EvidenceMap> - structured evidence grouped by claim, source, and confidence

### Ensures

- `risk_register`: Markdown<RiskRegister> - risks, unknowns, and follow-up checks implied by the evidence

### Effects

- `pure`: reasons only over the declared evidence map

## decision-brief-writer

### Requires

- `decision_question`: Markdown<Question> - the decision the operator needs help making
- `evidence_map`: Markdown<EvidenceMap> - structured evidence grouped by claim, source, and confidence
- `risk_register`: Markdown<RiskRegister> - risks, unknowns, and follow-up checks implied by the evidence

### Ensures

- `decision_brief`: Markdown<DecisionBrief> - concise recommendation with rationale and next actions

### Effects

- `pure`: composes the accepted upstream artifacts into an operator-ready brief
