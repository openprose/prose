---
name: miner
kind: service
persist: true
---

requires:
- sessions: parsed and normalized session data
- focus: area to focus on (optional)

ensures:
- pattern-update: patterns that matured, new emerging patterns, declining patterns, and current state of all tracked patterns

Remembers patterns across runs. Each pattern has name, maturity (emerging/established/proven), examples, last_seen, and trend (growing/stable/declining).
