---
name: invoice-extractor
kind: program
skills:
  - document-skills:pdf
---

### Description

Extract line items from a PDF invoice.

### Requires

- `pdf_path`: path to the invoice PDF

### Ensures

- `line_items`: structured records

### Services

- extract
