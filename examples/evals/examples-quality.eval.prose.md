---
name: examples-quality
kind: test
---

### Requires

- `package_root`: string - path to the example package root

### Ensures

- `verdict`: Markdown<EvalVerdict> - whether the curated examples package still represents current OpenProse best practice

### Effects

- `pure`: deterministic evaluation over package metadata and publish-check outputs
