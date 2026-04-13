---
name: synthesizer
kind: service
---

requires:
- ws-feedback: WebSocket observer findings
- file-feedback: file observer findings

ensures:
- action-items: unified UX assessment with correlated findings, prioritized action items (high/medium/low), evidence, and concrete recommendations
