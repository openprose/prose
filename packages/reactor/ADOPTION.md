# Reactor Adoption Contract

This page is the first-contact contract for the Reactor harness: the SDK
(`@openprose/reactor`), the CLI (`@openprose/reactor-cli`, the `reactor`
binary), and the replay viewer (`@openprose/reactor-devtools`).

## What Reactor is

Reactor is `React.memo` applied to expensive LLM work. You declare standing
**Responsibilities**; Reactor maintains a composed **world-model**, re-renders
only the responsibilities whose subscribed inputs actually moved (the reconciler
is dumb — fingerprint, schedule, commit, **no judge step**), and leaves a
content-addressed **receipt** behind every decision. Cost scales with surprise,
not the clock.

## Posture

- **Benchmarks are openly pending.** We publish the harness before the numbers.
  The proof you can check today is the keyless `reactor-devtools` replay — real
  per-node dispositions, cost by `surprise_cause`, and chain-verify — not a
  marketing figure.
- **Signer caveat (v1):** *signed* = tamper-evident at the meaning layer and
  chain-consistent, **not** yet a cryptographic byte hash. The null signer is the
  only honest v1 state.
- **Zero *runtime* deps in the SDK core.** The live render needs two peers
  (`@openai/agents`, `zod`); the keyless inspection/replay surface needs neither.

## Install

All three packages are live on npm. The on-ramp is the CLI plus the devtools
viewer. The keyless replay needs **no install at all** — run it through `npx`:

```sh
# keyless, no install:
npx -p @openprose/reactor-devtools reactor-devtools --example masked-relay --describe
```

For the full CLI, prefer a project-local install (no root, no global collisions):

```sh
npm install @openprose/reactor @openprose/reactor-cli @openprose/reactor-devtools
# then call the binaries with `npx reactor …` / `npx reactor-devtools …`.
# The live render also needs two peers:
npm install @openai/agents zod
```

A global install is an alternative — but `-g` can collide with other tools'
binaries and is `EACCES`-prone on Linux/WSL (use a user prefix/nvm or `sudo`):

```sh
npm i -g @openprose/reactor @openprose/reactor-cli @openprose/reactor-devtools \
         @openai/agents zod
```

Use Node 20 or newer.

## Golden path

The keyless replay is the first thing to touch — it works with no key and no
model call. Then scaffold and check your own responsibility offline; only the
live `compile`/`run` needs a model key.

```sh
# 1. Keyless: replay a saved run and read dispositions + cost + chain-verify.
reactor-devtools <state-dir> --describe
reactor-devtools <state-dir>                 # browser viewer

# 2. Scaffold and check your own responsibility — offline.
reactor init my-responsibility && cd my-responsibility
reactor doctor                               # node / SDK / skill-bundle / peers / key
reactor compile --check                      # honest STALE + contract fingerprint; zero cost

# 3. Run it live (needs a model key).
export OPENROUTER_API_KEY=...
reactor compile                              # freeze the canonicalizer + Forme topology into IR
reactor topology                             # the DAG Forme wired from your contracts
reactor run                                  # drain to quiescence; per-node dispositions + cost
reactor-devtools .reactor                    # replay YOUR run's receipts in the viewer
```

See **[`@openprose/reactor-cli`'s README](https://github.com/openprose/prose/blob/main/packages/reactor-cli/README.md)**
for the full command surface and the `reactor.yml` schema.

> **If you're an agent onboarding on behalf of a user:** the binary is `reactor`.
> Run `reactor init → doctor → compile → run`, then open
> `reactor-devtools <state-dir>` to inspect the receipt ledger. OpenProse
> contracts run on any Prose-Complete harness; the Reactor CLI is the
> deterministic host layer that compiles, runs, and inspects them.

## Supported today

- Local, deterministic receipt production through `reactor compile`/`run` and the
  SDK's render atom.
- Receipt verification, projection, and composition pins.
- The keyless `reactor-devtools` replay (per-node dispositions, cost rollup by
  `surprise_cause`, moved-facet diff, chain-verify) over any saved state-dir.

## Not yet supported

- Hosted production ingress, fulfillment quality, or oracle guarantees.
- A non-null cryptographic signer / non-repudiable byte-layer signatures.
- The fixpoint (the topology as a live responsibility) — specified and deferred.
- Postgres storage parity; large unbounded receipt logs without an external
  compaction/indexing plan.

If that boundary matches your use case, Reactor is suitable for a technical
spike, local evaluation, integration prototyping, and receipt-shape review.
