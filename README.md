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

> ### Coming from OpenProse (v0.14 or earlier)? Read this first.
>
> The Intelligent-React overhaul (`runtime_contract 1 → 2`) is a **breaking** vocabulary change. The headlines:
>
> - **The judge loop is retired wholesale.** The old judge → verdict → pressure → fulfillment loop is gone, replaced by a deterministic reconciler — a render runs only when a node's subscribed input fingerprints or its own contract fingerprint move. There is no LLM in the wake/commit decision.
> - **Kinds renamed/deleted.** `kind: service` is **renamed to `kind: function`** (`### Parameters` → `### Returns`); `kind: system` is **deleted** (composition is now intra-node ProseScript `call` or cross-node subscription, wired by Forme); `kind: responsibility` is **reshaped** into a mounted DAG node that gains `### Requires` + `### Maintains`. `### Ensures` is **renamed to `### Maintains`** (now the world-model schema, not just an output list); `### Criteria`/`### Memory`/`### Fulfillment` fold in.
> - **Old ledgers are abandoned, not migrated.** Existing runtime data — old `ReceiptV0` ledgers, the policy registry, bundled `runs/`/`state/`/`dist/` — is **greenfield**: there is **no data migrator**. Only your **source text** upgrades. Re-run from a clean state-dir.
> - **Upgrade your source with a dry run first.** `prose upgrade --dry-run` inspects your files and reports the concrete migration plan **without editing** — mechanical rewrites where safe, surfaced as manual-review diagnostics where judgment is needed (e.g. a `system`/`### Wiring` flatten-or-split). Run it before `prose upgrade`.

**You do not need React to use this.** Reactor is React-*flavored*, not React-gated: the contracts are Markdown, and the CLI, the receipts, and the keyless replay are entirely React-free. The plain-language version of the whole product is two sentences — *you declare what should stay true, the system watches the world, and it does expensive model work only when something material actually moved.* The React table below is an optional mental model for the people who already carry one; skip it freely.

If you *do* know React, you already know the shape — substitute three nouns:

| React | Reactor |
| --- | --- |
| Component | **Responsibility** — a declared standing goal |
| DOM | **World-model** — the maintained truth, on disk, passed by pointer |
| `render()` | **A bounded LLM session** that computes the next world-model |
| props | **Subscriptions** to other responsibilities' outputs |
| `React.memo` (skip if props unchanged) | **Skip the render if subscribed inputs haven't moved** |
| Manual dependency wiring | **Forme** — the graph wires itself from declared contracts |

The reconciler that decides *whether to wake* is deliberately **dumb and deterministic** — there is **no judge step**. The intelligence is frozen ahead of time, at compile, into a per-node canonicalizer and the Forme wiring. The memo key has no clock in it.

> **Versions (live on npm):** `@openprose/reactor` 0.2.0 ·
> `reactor-cli` 0.1.0 · `reactor-devtools` 0.1.0. The `reactor` binary ships from the
> **`reactor-cli`** package, so `reactor --version` prints the CLI version (0.1.0), not the
> SDK version (0.2.0) — expected, not a mismatch.

## Quickstart (60 seconds, no model key)

**1. Install.** All three packages are live on npm. The keyless step below needs no
install at all — run it straight through `npx`:

```bash
# no install — run the keyless replay directly:
npx -p @openprose/reactor-devtools reactor-devtools --example masked-relay --describe
```

For the full CLI, prefer a project-local install (no root, no global collisions):

```bash
npm install @openprose/reactor @openprose/reactor-cli @openprose/reactor-devtools
# then call the binaries with `npx reactor …` / `npx reactor-devtools …`
```

> **Local install?** The bare `reactor …` / `reactor-devtools …` commands shown below assume the
> binaries are on your `PATH` (a global install). After the project-local `npm install` above,
> prepend `npx` to them — e.g. `npx reactor init my-project`, `npx reactor-devtools ./replay --describe`.
> (The keyless `npx -p @openprose/reactor-devtools …` lines already do this and need no change.)

<details><summary>Global install (alternative — collision- and EACCES-prone)</summary>

```bash
npm i -g @openprose/reactor @openprose/reactor-cli @openprose/reactor-devtools
```

A global `-g` can collide with other tools' binaries, and on Linux/WSL it may fail with
`EACCES` — use a user prefix (nvm) or `sudo`, or just prefer the local install above.

**Air-gapped?** The *runtime* is offline-clean, but any `npm i`/`npm i -g` still reaches the
registry once for the CLI's `commander` dependency — replay / `doctor` / `compile --check`
afterward do not.
</details>

**2. See the thesis — keyless, no model call.** Replay a real saved run and read the per-node `rendered`/`skipped` dispositions, the receipt counts by `surprise_cause`, the token **cost rollup**, and per-node chain-verify:

```bash
npx -p @openprose/reactor-devtools reactor-devtools --example masked-relay --describe
```

```
dispositions  rendered=46 · skipped=31 · failed=0
surprise-cause  external=8 · input=69   (a.k.a. wake-cause)   ← receipt COUNTS, 77 total

COST ROLLUP  (tokens)
  total       fresh=27180 tokens · reused=12840 tokens · reuse=32%
    external  receipts=  8 fresh=   1080 tokens reused=840 tokens
    input     receipts= 69 fresh=  26100 tokens reused=12000 tokens
CHAIN-VERIFY ok
```

The `surprise-cause` line counts *receipts* by what woke them (8 external + 69 input = the 77 total receipts); the **cost rollup** below it is the actual token spend — `fresh` tokens are what each surprise cost, `reused` is what memoization saved (32% of the would-be tokens). That's "cost scales with surprise" — checkable, with no key and no spend. Frames where a memo-skip happened show as `skipped moved[—] fresh 0`.

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

Thirteen of the examples in [`skills/open-prose/examples/`](skills/open-prose/examples/) ship a committed, chain-verifiable `replay/` state-dir you can replay keyless — a deliberately wide spread of DAG shapes and domains, each with an offline test that drives the **real** reconciler at **zero model spend**. (The directory holds more contract-only examples without a committed ledger; the thirteen below are the ones with a `replay/`. Two of those thirteen — `masked-relay` and `tamper-forge` — share a **byte-identical** ledger: `tamper-forge` is an audit *lens* over the masked-relay receipts, so the set is **twelve distinct datasets plus one honest tamper-evidence lens**, not thirteen unrelated ledgers.)

> The six examples marked with **\*** below are also reachable **by name** from any directory via the devtools fixture bundle — e.g. `reactor-devtools --example masked-relay --describe`. The remaining examples replay by path.

| Example | What it shows | Domain |
| --- | --- | --- |
| `surprise-cost` * | memoized skip → surprise-render when the memo key moves | the core thesis |
| `renewal-risk` | a standing responsibility re-judging only the accounts that moved | SaaS / finance |
| `inbox-triage` * | diamond fan-in + failure isolation | email / ops |
| `monorepo-ci` * | hub fan-out blast radius; a failing test blocks the merge gate | dev tooling / CI |
| `research-tree` * | recursive propagation up a tree, branch-memoized | research |
| `masked-relay` * | peer-blind fan-out with deterministic masked projections | competitive intel |
| `agent-observatory` * | many cheap watchers → batched synthesis | agent ops |
| `tamper-forge` | attack a real ledger; watch chain-verify catch it (and where it honestly can't) | audit / security |
| `oblique-weave` | hidden-context adversarial roles | product strategy |
| `github-star-enricher` | per-entity fan-out + shared receipts + a human gate | growth / GTM |
| `implementation-pipeline` | fixed wide fan-out with per-facet lane wake | software delivery |
| `forme-fixpoint` | the topology as a responsibility (the self-wiring bootstrap) | meta |
| `basic-unit-suite` | the 13 micro-mechanics, one by one | substrate |

**Run any of them, keyless** (from a clone of this repo):

```bash
cd skills/open-prose/examples/surprise-cost
reactor-devtools ./replay --describe              # the render/skip/cost trail — no key, no spend
reactor --state-dir ./replay receipts             # the per-node ledger (list | verify | cost)
```

> **Installed from npm, not a repo clone?** The examples ship inside the SDK tarball at
> `node_modules/@openprose/reactor/skill/open-prose/examples/<name>/` (note: `skill`, singular,
> in the tarball — `skills`, plural, in the repo). So the same two commands are:
> ```bash
> cd node_modules/@openprose/reactor/skill/open-prose/examples/surprise-cost
> reactor-devtools ./replay --describe
> reactor --state-dir ./replay receipts
> ```

**Or run the offline gate** (this is what CI runs — all thirteen replay examples, zero spend):

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
- **No timestamp, no actor (yet):** a v1 receipt records *what* changed and *why* (fingerprints, wake cause, status, cost) but not *when* it was committed or *who* committed it — so the ledger is a verifiable record of decisions and their evidence, **not yet a substitute for an external audit log** that must answer "at what time, by which principal."
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
