---
name: variables-and-context
kind: system
---

### Services

- `researcher`
- `analyst`
- `writer`

### Description

Demonstrates how Contract Markdown auto-wiring can replace explicit ProseScript `let` bindings and `context:` passing. Forme matches `### Requires` to `### Ensures` automatically.

### Requires

- `topic`: a research question (default: "current state of quantum computing")

### Ensures

- `report`: executive summary covering research findings, analysis, market trends, assumptions, and caveats
- `deep-dive`: polished technical deep-dive section

## researcher

### Requires

- `topic`: research question to investigate

### Ensures

- `findings`: concise research findings with evidence, confidence, and caveats

## analyst

### Requires

- `findings`: research findings to interpret

### Ensures

- `analysis`: market trends, assumptions, and implications derived from the findings

## writer

### Requires

- `findings`: source findings to preserve
- `analysis`: interpretation and implications to synthesize

### Ensures

- `report`: executive summary covering research findings, analysis, market trends, assumptions, and caveats
- `deep-dive`: polished technical deep-dive section
