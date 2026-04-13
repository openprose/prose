---
name: skills-and-imports-demo
kind: program
services: [researcher, documenter]
---

Demonstrates how v2 programs import services from the registry. In v2, `import` and `skills:` are replaced by listing registry services in the `services:` list.

requires:
- topic: a research question (default: "recent developments in renewable energy storage")

ensures:
- summary: a technical summary incorporating research findings
