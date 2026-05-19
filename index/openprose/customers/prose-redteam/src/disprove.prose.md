---
name: disprove
kind: service
---

# Disprove

### Description

Independently re-reproduces a candidate finding from its declared finding and
PoC alone. Confirms by reproduction or refutes — it can never introduce a
finding of its own. This is the structural firewall: it is denied the hunter's
reasoning by construction.

### Requires

- `finding`: the candidate finding as declared by a hunter
- `poc`: the hunter's compiled+executed PoC, or its no-repro note

### Ensures

- `verdict`: `confirmed`, `refuted`, or `unreproducible`, with the evidence
  observed during the independent attempt
- `finding`: the same finding, annotated with the verdict — never a new or
  broadened finding

### Shape

- `self`: independently re-run the PoC and judge whether it reproduces
- `delegates`: none
- `prohibited`: introducing any finding not present in the input; broadening
  the input finding's scope or impact; reading any hunter workspace or
  reasoning; running the PoC against an external or live system

### Strategies

- treat the input as adversarial: a finding is confirmed only when the PoC
  reproduces independently from the declared inputs, not because the hunter
  argued well
- a no-repro note is `unreproducible`, never `confirmed`
- a candidate that carries no finding (a refusal or an empty hunt) has nothing
  to reproduce: carry it through as `unreproducible` with that reason — never
  invent a finding to fill the gap
- if the PoC reproduces a real but different weakness, that is `refuted` for
  this finding plus a note — not a silently mutated finding; a new weakness is
  recon's and the hunters' job in a later round, not this service's
