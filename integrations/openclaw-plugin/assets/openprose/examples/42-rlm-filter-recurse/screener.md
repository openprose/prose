---
name: screener
kind: service
---

requires:
- documents: collection to screen
- question: what to look for

ensures:
- relevant: documents likely relevant to the question, erring toward inclusion
