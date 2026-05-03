---
name: validate-ir
kind: service
---

# Validate IR

Check that compiler output is a deterministic v0 repository IR manifest before
it is written as `manifest.next.json`.

### Requires

- `manifest`: repository IR JSON object.

### Ensures

- `valid`: whether the manifest satisfies the v0 contract.
- `errors`: structural validation errors, empty when valid.

### Strategies

- Require `kind` to be `openprose.repository-ir`.
- Require `version` to be `0`.
- Require `sources` to be an array of objects with non-empty `path` and known
  `kind`.
- Require `responsibilities` to be an array preserving `Goal`, `Continuity`,
  `Criteria`, `Constraints`, and optional fulfillment intent.
- Require `triggers` to be an array of semantic trigger-intent records.
- Require `activations` to be an array of semantic activation-intent records.
- Require `formeManifests` to be an array of structured Forme wiring objects.
- Require `diagnostics` to be an array of objects with `severity` and
  non-empty `message`.
- Recognize diagnostic severities `info`, `warning`, and `error`.
- Check that responsibility, trigger, activation, and source references point
  at discovered records where possible.
- Check that fulfillment activation `formeManifestId` values point at known
  Forme manifests when present.
- Check that Forme graph nodes, input bindings, execution order, environment
  requirements, and source references are structurally complete.
- Refuse to write `manifest.next.json` when validation fails.
