<p align="center">
  <img src="https://openprose.ai/readme-header.png" alt="OpenProse — Reactor" width="100%" />
</p>

<p align="center">
  <strong>Reactor: <code>React.memo</code> for expensive LLM work — cost scales with surprise, not the clock.</strong>
</p>

<p align="center">
  <a href="#quickstart-60-seconds-no-model-key">Quickstart</a> ·
  <a href="skills/open-prose/examples/">Examples</a> ·
  <a href="#the-technical-report">Technical report</a> ·
  <a href="packages/reactor/EVALS.md">Send us an eval</a> ·
  <a href="skills/open-prose/SKILL.md">OpenProse docs</a>
</p>

---

## What this is

**Reactor (`@openprose/reactor`) is a small, open-source harness for AI work that has to *keep being true* after a chat ends.**

You declare the truths you want kept current as OpenProse **Responsibilities** (standing goals). Reactor keeps a composed **world-model** up to date against a changing world, re-renders only the responsibilities whose inputs actually moved, and leaves a content-addressed **receipt** behind every decision.

In plain terms: you declare what should stay true, the system watches the world, and it does expensive model work **only when something material actually moved**.

> **New here?** Start with the Quickstart below — one keyless command proves the whole idea in under a second.
>
> **Came from OpenProse?** This is the *dependency-across-runs* layer your contracts kept asking for — the natural next step, not a turn away. The [technical report](#the-technical-report) §4 is the through-line.

If you know React, you already know the shape — substitute three nouns:

| React | Reactor |
| --- | --- |
| Component | **Responsibility** — a declared standing goal |
| DOM | **World-model** — the maintained truth, on disk, passed by pointer |
| `render()` | **A bounded LLM session** that computes the next world-model |
| props | **Subscriptions** to other responsibilities' outputs |
| `React.memo` (skip if props unchanged) | **Skip the render if subscribed inputs haven't moved** |
| Manual dependency wiring | **Forme** — the graph wires itself from declared contracts |

The reconciler that decides *whether to wake* is deliberately **dumb and deterministic** — there is **no judge step**. The intelligence is frozen ahead of time, at compile, into a per-node canonicalizer and the Forme wiring. The memo key has no clock in it.

> **Versions (currently staged tarballs, pre-publish):** `@openprose/reactor` 0.2.0 ·
> `reactor-cli` 0.1.0 · `reactor-devtools` 0.1.0. The `reactor` binary ships from the
> **`reactor-cli`** package, so `reactor --version` prints the CLI version (0.1.0), not the
> SDK version (0.2.0) — expected, not a mismatch.

## Quickstart (60 seconds, no model key)

**1. Install** (post-publish):

```bash
npm i -g @openprose/reactor @openprose/reactor-cli @openprose/reactor-devtools
```

<details><summary>Pre-publish (staged tarballs — SDK first)</summary>

```bash
# from the directory holding the .tgz files (or use absolute paths)
npm i -g ./openprose-reactor-0.2.0.tgz \
         ./openprose-reactor-cli-0.1.0.tgz \
         ./openprose-reactor-devtools-0.1.0.tgz
```

**Air-gapped?** The *runtime* is offline-clean, but a global `npm i -g` still reaches the
registry for the CLI's `commander` dependency — replay / `doctor` / `compile --check` afterward
do not. If `-g` fails with `EACCES` on Linux/WSL, use a user prefix (nvm) or `sudo`.
</details>

**2. See the thesis — keyless, no model call.** Replay a real saved run and read the per-node `rendered`/`skipped` dispositions, the cost rollup split by `surprise_cause`, and per-node chain-verify:

```bash
reactor-devtools --example masked-relay --describe
```

```
dispositions: rendered 46 · skipped 31   (reuse 32%)
cost rollup by surprise-cause: external 8 · input 69   total 77
CHAIN-VERIFY ok
```

That's "cost scales with surprise" — checkable, with no key and no spend. Frames where a memo-skip happened show as `skipped moved[—] fresh 0`.

> **Prefer the browser?** Drop `--describe` — `reactor-devtools --example masked-relay` boots an
> animated DAG viewer at a localhost URL: nodes flash on render, dim-pulse on memo-skip, with a
> live cost meter.

**3. Scaffold and inspect — keyless.** Everything here runs offline:

```bash
reactor init my-project && cd my-project
reactor doctor                          # what's present + the exact fix for anything missing
reactor compile --check; echo "exit=$?" # offline; exits 1 if the contract set is STALE (CI-wireable)
```

**4. Go live (needs a model key).** These steps reach the model surface — set `OPENROUTER_API_KEY` and the two optional peers; a keyless reader can stop at step 3.

```bash
npm i -g @openai/agents zod          # the two optional live peers
reactor compile                      # Forme wires the DAG; freezes per-node canonicalizers
reactor serve --http 8080            # drive the scaffold's static gateway to a real receipt
reactor-devtools .reactor --describe # replay YOUR live run's ledger
```

> Use `reactor serve` (not `reactor run`) to drive a scaffold's **static** gateway — `serve`
> ingests its seeded items; `run` is for graphs whose connectors emit on their own.

## The example library

Thirteen runnable examples ship in [`skills/open-prose/examples/`](skills/open-prose/examples/) — a deliberately wide spread of DAG shapes and domains, each with a committed, chain-verifiable `replay/` state-dir and an offline test that drives the **real** reconciler at **zero model spend**.

| Example | What it shows | Domain |
| --- | --- | --- |
| `surprise-cost` | memoized skip → surprise-render when the memo key moves | the core thesis |
| `renewal-risk` | a standing responsibility re-judging only the accounts that moved | SaaS / finance |
| `inbox-triage` | diamond fan-in + failure isolation | email / ops |
| `monorepo-ci` | hub fan-out blast radius; a failing test blocks the merge gate | dev tooling / CI |
| `research-tree` | recursive propagation up a tree, branch-memoized | research |
| `masked-relay` | peer-blind fan-out with deterministic masked projections | competitive intel |
| `agent-observatory` | many cheap watchers → batched synthesis | agent ops |
| `tamper-forge` | attack a real ledger; watch chain-verify catch it (and where it honestly can't) | audit / security |
| `oblique-weave` | hidden-context adversarial roles | product strategy |
| `github-star-enricher` | per-entity fan-out + shared receipts + a human gate | growth / GTM |
| `implementation-pipeline` | fixed wide fan-out with per-facet lane wake | software delivery |
| `forme-fixpoint` | the topology as a responsibility (the self-wiring bootstrap) | meta |
| `basic-unit-suite` | the 13 micro-mechanics, one by one | substrate |

**Run any of them, keyless:**

```bash
cd skills/open-prose/examples/surprise-cost
reactor-devtools ./replay --describe     # the render/skip/cost trail — no key, no spend
reactor receipts ./replay                # the per-node ledger
```

**Or run the offline gate** (this is what CI runs — all 13, zero spend):

```bash
REACTOR_OFFLINE=1 pnpm test:examples
```

To take one live, `cd` into its dir and run `reactor doctor → compile → topology → run → serve` with a key set. Each example's `README.md` carries its standing goal, DAG sketch, and the full flow.

## The technical report

The full architecture write-up — the React metaphor that *is* the design, the Forme wiring, the receipt model, an honest RLM accounting, and why nothing on the market is a drop-in replacement — is the **[Reactor technical report](docs/reactor/v0.1/report.md)**.

## Honest status

In the spirit of the receipts:

- **Built and runnable:** the render atom, the content-addressed world-model store, the compiled canonicalizer with facets, Forme's wiring with diagnostics + acyclicity, postcondition-gated commits (no judge step), the chain-verifiable receipt ledger, and the forecast/continuity scheduler — all exercised by an offline test suite (no model calls in the commit gate) plus the 13 example gates.
- **Benchmarks are openly pending — on purpose.** We're publishing the harness before the numbers; we won't imply a measured speedup we haven't run. The proof you can check today is the keyless replay above.
- **Signer caveat:** in v1, *signed* means tamper-evident at the meaning layer and chain-consistent — not yet a cryptographic byte hash. `reactor receipts verify` proves the receipt **chain** is consistent, but does not yet bind the world-model artifacts (editing a `world-models/*/published.json` while leaving `receipts.json` intact is not caught). The `tamper-forge` example demonstrates exactly this boundary.
- The **fixpoint** (topology-as-responsibility) is specified and deferred; facet inference and ledger compaction are named roadmap.

## Works with any harness — Reactor is the fast path

Reactor is built on **OpenProse**: Markdown contracts that run on any Prose-Complete agent harness. The `.prose.md` contracts in these examples are harness-agnostic. Reactor itself is a real SDK + CLI + devtools you install and run — the deterministic host that compiles, runs, and inspects standing responsibilities, and the recommended fast path for them.

**Agents onboarding on behalf of a user:** the binary is `reactor`. Lead with the keyless `reactor-devtools` replay (step 2) — it proves the mechanism with no key and no spend — then `reactor init → doctor → compile → serve`.

## Send us the thing it can't do yet

The most useful thing you can hand us isn't a compliment or a flattering benchmark. It's a **responsibility the harness *should* keep and doesn't** — a standing goal that breaks the surprise story, a wiring Forme gets wrong, a domain where this falls apart. The short guide to authoring one from the public SDK is **[`packages/reactor/EVALS.md`](packages/reactor/EVALS.md)** (shipped inside the SDK tarball too).

- [Issues](https://github.com/openprose/prose/issues) · [Contributing](CONTRIBUTING.md) · [MIT License](LICENSE)
- [Privacy Policy](PRIVACY.md) · [Terms of Service](TERMS.md)

---

*The conversation always ends. The responsibility shouldn't have to.*
