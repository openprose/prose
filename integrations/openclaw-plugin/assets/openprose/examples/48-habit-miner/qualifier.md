---
name: qualifier
kind: service
---

requires:
- pattern-update: miner's pattern analysis
- min-frequency: minimum threshold

ensures:
- qualified: ranked list of patterns ready for automation with reasoning

Rejects patterns that are still emerging, too simple, too variable, or declining.
