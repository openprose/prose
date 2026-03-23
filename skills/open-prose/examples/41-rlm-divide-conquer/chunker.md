---
name: chunker
kind: service
---

requires:
- corpus: text to split

ensures:
- chunks: 4-8 semantically coherent pieces that preserve meaning at boundaries
