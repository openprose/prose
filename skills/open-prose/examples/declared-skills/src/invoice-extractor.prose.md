---
name: invoice-extractor
kind: system
---

# Invoice Extractor

### Description

Extracts structured line items, totals, and metadata from a vendor invoice PDF.

### Requires

- `invoice`: a vendor invoice as a PDF document

### Ensures

- `line_items`: ordered list of `{ description, quantity, unit_price, total }`
  rows extracted from the invoice
- `totals`: `{ subtotal, tax, total, currency }` reconciled against the rows
- `metadata`: `{ vendor, invoice_number, issue_date, due_date }` extracted from
  the invoice header

### Skills

- document-skills:pdf

### Strategies

- when a row's quantity or unit price is ambiguous, prefer the value that
  reconciles against the line total and flag the ambiguity in
  `metadata.notes`
- when the invoice header is missing a field, leave the corresponding
  `metadata` value `null` rather than guessing
