---
name: dataflow-complex
kind: program
---

### Services

- `normalize-account`
- `market-research`
- `customer-research`
- `risk-review`
- `citation-pack`
- `scorecard-builder`
- `brief-writer`
- `final-assembler`

### Requires

- `account_record`: Json<AccountRecord> [company_private.accounts] - private CRM account record
- `research_question`: string - decision question to answer
- `market_window`: string - market freshness window

### Ensures

- `final_brief`: Markdown<FinalBrief> - final executive brief
- `scorecard`: Json<Scorecard> - fit scorecard for targeted recompute
- `risk_digest`: Markdown<RiskDigest> - risk digest for targeted recompute

### Effects

- `pure`: graph-level deterministic synthesis over selected node outputs

## normalize-account
---
kind: service
---

### Requires

- `account_record`: Json<AccountRecord> [company_private.accounts] - private CRM account record

### Ensures

- `normalized_account`: Json<AccountRecord> - normalized private account profile

### Effects

- `pure`: deterministic normalization

### Strategies

Return the original account record as valid JSON with the same `company`, `segment`,
`employees`, `region`, and `signals` fields.

## market-research
---
kind: service
---

### Runtime

- `freshness`: 1h

### Requires

- `research_question`: string - decision question to answer
- `market_window`: string - market freshness window
- `normalized_account`: Json<AccountRecord> - normalized account profile

### Ensures

- `market_signals`: Json<Signals> - market-side evidence

### Effects

- `read_external`: market scan, freshness 1h

### Strategies

Return `market_signals` as valid JSON matching `Signals`: include a short
`summary`, a numeric `confidence` between 0 and 1, and two or more string
`items`.

## customer-research
---
kind: service
---

### Requires

- `research_question`: string - decision question to answer
- `normalized_account`: Json<AccountRecord> - normalized account profile

### Ensures

- `customer_signals`: Json<Signals> - customer-side evidence

### Effects

- `pure`: deterministic analysis of private account context

### Strategies

Return `customer_signals` as valid JSON matching `Signals`: include a short
`summary`, a numeric `confidence` between 0 and 1, and two or more string
`items`.

## risk-review
---
kind: service
---

### Requires

- `normalized_account`: Json<AccountRecord> - normalized account profile
- `market_signals`: Json<Signals> - market-side evidence
- `customer_signals`: Json<Signals> - customer-side evidence

### Ensures

- `risk_digest`: Markdown<RiskDigest> - concise risk analysis

### Effects

- `pure`: deterministic risk synthesis

### Strategies

Return a concise Markdown risk digest that mentions security review and rollout
sequencing when the upstream evidence supports those risks.

## citation-pack
---
kind: service
---

### Runtime

- `subagents`: false

### Requires

- `market_signals`: Json<Signals> - market-side evidence
- `customer_signals`: Json<Signals> - customer-side evidence

### Ensures

- `citation_pack`: Markdown<CitationPack> - evidence notes for final assembly

### Effects

- `pure`: deterministic citation assembly

### Strategies

Return concise Markdown citations or evidence notes grounded only in
`market_signals` and `customer_signals`.

## scorecard-builder
---
kind: service
---

### Requires

- `normalized_account`: Json<AccountRecord> - normalized account profile
- `market_signals`: Json<Signals> - market-side evidence
- `customer_signals`: Json<Signals> - customer-side evidence
- `risk_digest`: Markdown<RiskDigest> - risk analysis

### Ensures

- `scorecard`: Json<Scorecard> - fit scorecard for targeted recompute

### Effects

- `pure`: deterministic scorecard synthesis

### Strategies

Return `scorecard` as valid JSON matching `Scorecard`: `fit` must be one of
`high`, `medium`, or `low`; `score` must be an integer from 0 through 100;
`rationale` must be a short string; `risks` must be a string array.

## brief-writer
---
kind: service
---

### Requires

- `normalized_account`: Json<AccountRecord> - normalized account profile
- `scorecard`: Json<Scorecard> - fit scorecard
- `risk_digest`: Markdown<RiskDigest> - risk analysis

### Ensures

- `executive_brief`: Markdown<ExecutiveBrief> - draft executive brief

### Effects

- `pure`: deterministic brief synthesis

### Strategies

Return a concise Markdown executive brief that references the scorecard fit and
the most important risk.

## final-assembler
---
kind: service
---

### Requires

- `executive_brief`: Markdown<ExecutiveBrief> - draft executive brief
- `scorecard`: Json<Scorecard> - fit scorecard
- `risk_digest`: Markdown<RiskDigest> - risk analysis
- `citation_pack`: Markdown<CitationPack> - evidence notes

### Ensures

- `final_brief`: Markdown<FinalBrief> - final executive brief

### Effects

- `pure`: deterministic final assembly

### Strategies

Return a concise Markdown final brief that begins with
`DATAFLOW_COMPLEX_FINAL_OK:` and integrates the executive brief, scorecard,
risk digest, and citations.
