# Signpost 000: RFC 017 Plan Created

## Summary

Created the RFC 017 planning spine for OpenProse Native Company deployments.

The core decision is that a deployment is not a Git repository. It is an
org-scoped immutable package version plus environment, policy, triggers, and
mutable deployment state. Git remains source provenance.

## Test Notes

Planning-only slice. Before implementation begins, re-run:

```bash
bun run prose publish-check /Users/sl/code/openprose/customers/prose-openprose --strict
bun run measure:examples
bun run confidence:runtime
```

## Next

Begin Phase 01 by adding deployment vocabulary, manifest shape, and deployment
preflight contracts in the OSS package.

