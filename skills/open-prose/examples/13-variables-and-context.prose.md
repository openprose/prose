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
