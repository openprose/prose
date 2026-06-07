# repository-ir v0 fixtures (CLI-owned)

Golden `openprose.repository-ir` **v0** manifests for the CLI's own compile path:
`compileRepositorySource` (judge-era responsibilities/triggers/activations) →
`validateRepositoryIr` → `repositoryIrToTopology` (the reactor bridge). They are the
inputs `repository-ir.test.ts` and `responsibility-status.test.ts` exercise the v0
validator with.

**Why these live here (and not under `tests/open-prose/compiler/`).** These tests
used to borrow the SKILL compiler's golden outputs in the repo-root
`tests/open-prose/compiler/expected/` directory, because both compilers emitted the
same v0 format. PR #106 ("Reactor harness 0.3.0") migrated the SKILL compiler to the
new `openprose.compile-phase-ir` **v2** (topology + canonicalizers + postconditions,
no judge) and regenerated those golden files — but the CLI's own `repository-source-compiler`
+ `validateRepositoryIr` remain v0 (the CLI authors v0 and bridges it to the reactor
topology). Feeding v2 fixtures to the v0 validator broke 21 tests. The fixtures here
are the v0 manifests recovered from immediately before that migration (`f12dcda~1`);
the CLI compiler and validator are unchanged since, so they still faithfully describe
the CLI's current v0 contract.

Keeping them under `tools/cli/` makes the ownership explicit: the SKILL compiler's
`compile-phase-ir` fixtures are validated by `tests/open-prose/compiler/compiler-ir.test.ts`;
these `repository-ir` v0 fixtures are the CLI's, and the two no longer share files.

If the CLI is ever migrated to consume `compile-phase-ir` directly, retire these along
with the v0 compiler/validator/bridge in one change — don't quietly re-point the tests.
