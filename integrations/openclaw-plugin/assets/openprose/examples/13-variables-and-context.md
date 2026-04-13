---
name: variables-and-context
kind: program
services: [researcher, analyst, writer]
---

Demonstrates how v2 auto-wiring replaces v1's explicit `let`/`const` bindings and `context:` passing. In v2, Forme matches `requires` to `ensures` automatically.

requires:
- topic: a research question (default: "current state of quantum computing")

ensures:
- report: comprehensive executive summary covering research, analysis, and market trends
- deep-dive: polished technical deep-dive section
