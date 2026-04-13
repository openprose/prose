---
name: guardian
kind: service
---

requires:
- proposals: language change proposals
- spec-patches: specification additions
- current-spec: current language spec
- task: what to assess

ensures:
- assessment: breaking level (0-3), complexity cost, interaction risks, implementation effort for each proposal
- aggregate-assessment: whether changes are coherent or represent feature creep
- recommendation: PROCEED, REDUCE SCOPE, PHASE INCREMENTALLY, or HALT
