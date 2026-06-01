# Reactor Flat Tokens Example — superseded

> **This example is deprecated and does not run on the published v0.2.0 surface.**
> `flat-tokens.example.mjs` imports `@openprose/reactor-cradle` (a package that is
> not part of the released harness) and reproduces a token-accounting headline
> (`46:46`, judge cassettes) from a superseded, deleted build. The current Reactor
> harness has **no judge step** and ships no `cradle` package. Do not treat the
> numbers in this directory as the cost claim — the honest, current proof is the
> keyless `reactor-devtools` replay below.

## The headline proof is now the keyless devtools replay

The thesis — *cost scales with surprise, not the clock* — is checkable offline,
with no model key and no model call, by replaying a saved run's receipt ledger:

```sh
reactor-devtools <state-dir> --describe
```

`--describe` prints, per node: the `rendered`/`skipped` dispositions, the
moved-facet diff, a cost rollup split by `surprise_cause` (so you can read the
reuse directly off real receipts), and a per-node chain-verify — no marketing
number. The same dir opens in the browser viewer with `reactor-devtools
<state-dir>`.

To produce your own saved run:

```sh
reactor init my-responsibility && cd my-responsibility
export OPENROUTER_API_KEY=...
reactor compile && reactor run
reactor-devtools .reactor --describe
```

See **[`packages/reactor-cli/README.md`](../../../../packages/reactor-cli/README.md)**
for the full quickstart and
**[`packages/reactor-devtools`](../../../../packages/reactor-devtools/)** for the
viewer and its committed replay fixtures.
