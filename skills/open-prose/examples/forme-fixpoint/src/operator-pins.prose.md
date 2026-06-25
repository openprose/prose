---
name: operator-pins
kind: gateway
version: 0.15.0
id: operator-pins
---

# Operator Pins

The external channel for **explicit human intent** over the topology: when
Forme reports an ambiguity it cannot resolve on its own (two producers maintain
the same facet), an operator resolves it by pinning the intended producer. This
gateway carries those pins into the graph.

Operator pins are how the active/candidate split stays *safe and human-steered*:
Forme never silently guesses across an ambiguity; it parks a diagnostic and
waits for a pin.

### Maintains

`OperatorPinLedger` — the standing set of operator overrides.

```
OperatorPinLedger {
  pins: [
    { kind, facet, preferred_producer, rejected_producer, reason }
  ],
  pin_set_fingerprint
}
```

### Continuity: external-driven

External. This gateway is an **entry point**: wake when an operator resolves
ambiguity or overrides topology. No `### Requires`.
