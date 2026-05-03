---
name: validate-ir
kind: service
---

# Validate IR

Check that compiler output is a deterministic v0 repository IR shell before it
is written as `manifest.next.json`.

### Requires

- `manifest`: repository IR JSON object.

### Ensures

- `valid`: whether the manifest satisfies the v0 shell contract.
- `errors`: structural validation errors, empty when valid.

### Strategies

- Require `kind` to be `openprose.repository-ir`.
- Require `version` to be `0`.
- Require `sources` to be an array of objects with non-empty `path` and known
  `kind`.
- Require `diagnostics` to be an array of objects with `severity` and
  non-empty `message`.
- Recognize diagnostic severities `info`, `warning`, and `error`.
- Refuse to write `manifest.next.json` when validation fails.
