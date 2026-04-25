# Compatibility Removal Notes

**Date:** 2026-04-25
**Phase:** 01.4 Delete Or Quarantine Non-Ideal Compatibility

The first compatibility cleanup removes the public illusion that fixture output
materialization is the OpenProse runtime.

## Removed Or Quarantined

| Old surface | New surface | Reason |
| --- | --- | --- |
| `prose materialize <file.prose.md>` | `prose fixture materialize <file.prose.md>` | The old command made caller-supplied fixture outputs look like canonical execution. Fixture materialization is useful for deterministic tests, but it is not the runtime center. |
| `npm run materialize` | `npm run fixture:materialize` | Keep package scripts honest about fixture-only behavior. |
| Help text advertising `materialize` as a peer runtime command | Help text advertising `fixture` as deterministic development commands | Clears the path for `prose run` to become the canonical runtime command in Phase 05. |

## Still Temporary

- `materializeSource` and `materializeFile` remain as library functions for
  current tests and remote-envelope scaffolding.
- `remote execute` still wraps fixture materialization. Phase 08 replaces that
  with the real runtime kernel.
- Status and trace still read loose run directories. Phase 03 replaces that
  with the store.

This slice names the old behavior honestly without pretending the replacement
runtime exists yet.
