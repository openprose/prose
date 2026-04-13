---
name: research-and-summarize
kind: service
---

requires:
- topic: a research question or area to investigate (default: "latest developments in AI agents and multi-agent systems")

ensures:
- summary: 5 bullet points covering key findings with practical implications for developers
- each bullet point: grounded in specific papers or announcements from the past 6 months

strategies:
- when few sources found: broaden search terms and check adjacent fields
- when findings are too technical: translate to practical developer implications
