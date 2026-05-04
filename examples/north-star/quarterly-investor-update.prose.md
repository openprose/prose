---
name: quarterly-investor-update
kind: program
skills:
  - document-skills:pdf
---

### Description

A founder-facing program that turns a prior investor letter (PDF) plus this
quarter's operating notes into a polished investor update: an extracted
financial baseline, a markdown brief grounded in that baseline, and a
ready-to-send `.docx` letter. The program reads the prior letter through the
`document-skills:pdf` skill so every sub-service can cite carry-over metrics by
page; the formatter additionally requires `document-skills:docx` to render the
final artifact. Both skills are declared on the contract so preflight fails
closed when the harness is not equipped to do this work.

### Services

- `historical-letter-extractor`
- `investor-brief-synthesizer`
- `investor-letter-formatter`

### Requires

- `prior_letter_pdf`: path<PriorInvestorLetterPdf> - prior quarter investor letter as a PDF on disk
- `operating_notes`: Markdown<OperatingNotes> - founder notes on this quarter: revenue, runway, hires, customer signals
- `brand_context`: Markdown<BrandContext> - company positioning, voice, and investor-facing constraints
- `delivery_target`: path<DeliveryTarget> - directory the formatted `.docx` letter should be written to

### Ensures

- `historical_baseline`: Json<HistoricalBaseline> - prior-quarter ARR, runway, headcount, and named priorities pulled from the PDF with page citations
- `investor_brief`: Markdown<InvestorBrief> - this quarter's investor brief grounded in the baseline and operating notes
- `investor_letter`: DeliveryReceipt<InvestorLetter> - receipt for the rendered `.docx` letter with content hash and target path

### Effects

- `read_external`: opens the caller-provided PDF via the agent skill
- `mutates_repo`: writes the `.docx` letter into the caller-provided delivery target
- `human_gate`: founder approval is required before the `.docx` is written

## historical-letter-extractor

### Requires

- `prior_letter_pdf`: path<PriorInvestorLetterPdf> - prior quarter investor letter as a PDF on disk

### Ensures

- `historical_baseline`: Json<HistoricalBaseline> - prior-quarter ARR, runway, headcount, and named priorities pulled from the PDF with page citations

### Effects

- `read_external`: opens the caller-provided PDF via the agent skill

### Strategies

Use the inherited `document-skills:pdf` skill to extract the financial
narrative from the prior letter. Prefer page-anchored quotes over paraphrase:
the baseline is downstream evidence, not commentary. When a metric is missing,
emit a `null` field and a `gaps` entry naming the page that should have
contained it; do not invent numbers.

## investor-brief-synthesizer

### Requires

- `historical_baseline`: Json<HistoricalBaseline> - prior-quarter ARR, runway, headcount, and named priorities pulled from the PDF with page citations
- `operating_notes`: Markdown<OperatingNotes> - founder notes on this quarter: revenue, runway, hires, customer signals
- `brand_context`: Markdown<BrandContext> - company positioning, voice, and investor-facing constraints

### Ensures

- `investor_brief`: Markdown<InvestorBrief> - this quarter's investor brief grounded in the baseline and operating notes

### Effects

- `pure`: synthesis over the accepted baseline, operating notes, and brand context

### Strategies

Open with the delta against the prior-quarter baseline before introducing new
narrative. Every quantitative claim must trace back to either the baseline or
the operating notes; the formatter cannot invent provenance for you. Keep the
voice consistent with `brand_context` so the downstream `.docx` reads as one
document, not a collage of stages.

## investor-letter-formatter
---
kind: service
skills:
  - document-skills:docx
---

### Requires

- `investor_brief`: Markdown<InvestorBrief> - this quarter's investor brief grounded in the baseline and operating notes
- `brand_context`: Markdown<BrandContext> - company positioning, voice, and investor-facing constraints
- `delivery_target`: path<DeliveryTarget> - directory the formatted `.docx` letter should be written to

### Ensures

- `investor_letter`: DeliveryReceipt<InvestorLetter> - receipt for the rendered `.docx` letter with content hash and target path

### Effects

- `mutates_repo`: writes the `.docx` letter into the caller-provided delivery target
- `human_gate`: founder approval is required before the `.docx` is written

### Strategies

Render the brief into a `.docx` using `document-skills:docx`. Preserve the
section order from the brief; do not re-edit prose at format time. The receipt
must record the absolute output path and a content hash so a later run can
verify the artifact without re-rendering. The system-level `document-skills:pdf`
skill remains in scope here for footnote rendering of carry-over citations from
the prior letter — service-level skills are additive, not exclusive.
