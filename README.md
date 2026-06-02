<p align="center">
  <img src="https://openprose.ai/readme-header.png" alt="OpenProse — Reactor" width="100%" />
</p>

<p align="center">
  <strong>OpenProse: declare the outcomes you want kept true, in Markdown.<br/>
  Reactor: the harness that keeps them true — cost scales with surprise, not the clock.</strong>
</p>

<p align="center">
  <a href="#quickstart-60-seconds-no-model-key">Quickstart</a> ·
  <a href="#the-shape-openprose--reactor">The shape</a> ·
  <a href="skills/open-prose/examples/">Examples</a> ·
  <a href="#the-sdk-one-call-then-go-deeper">The SDK</a> ·
  <a href="#honest-status">Honest status</a> ·
  <a href="packages/reactor/EVALS.md">Send us an eval</a>
</p>

---

## What this is

**OpenProse is a programming paradigm: you *declare the outcomes you want kept true* — an ideal world-model — instead of issuing instructions.** You write that intent as familiar structured **Markdown contracts** (`*.prose.md`), with optional imperative **ProseScript** fulfillment plans when order, loops, or exact choreography matter. The render function is not deterministic byte code — it's declarative Markdown fulfilled by a bounded agent session. OpenProse shipped first as a Skill and runs on **any Prose-Complete agent harness**.

**Reactor (`@openprose/reactor`) is the harness built to run OpenProse** — and the recommended **fast path**. It keeps a composed **world-model** up to date against a changing world, re-rendering only the declared facets whose upstream inputs actually moved (memoized agent sessions wired into a DAG), and leaves a content-addressed **receipt** behind every decision.

These are not two systems. They are **one system, two layers that fit together**: OpenProse is the language you author in; Reactor is the deterministic host that serves it efficiently. The thesis Reactor works toward:

> **Inference cost that scales with surprise, not wall-clock time.**

In plain terms: you declare what should stay true, the system watches the world, and it does expensive model work **only when something material actually moved**.

> **New here?** Start with the Quickstart below — one keyless command proves the whole idea in under a second, no model key and no spend.
>
> **Coming from OpenProse?** Reactor is the *dependency-across-runs* layer your contracts kept asking for — the natural next step, not a turn away. The same `.prose.md` you already write is what Reactor runs.

## The shape: OpenProse → Reactor

You author **Responsibilities** — standing goals, written as Markdown contracts:

- **`### Maintains`** is the world-model schema: what truth this node keeps current, which fields are *material* (and so move the fingerprint) vs immaterial, optional `####` **facets** that split the truth into independently-subscribable parts, and the postconditions a render must satisfy before it may commit.
- **`### Requires`** names the upstream facets this node subscribes to. Forme — the wiring layer — matches `Requires.<facet>` ↔ `Maintains.<facet>` and draws the subscription edge. *Structure is subscription;* the graph wires itself from the contracts.
- **`### Continuity`** declares the wake source: input-driven by default, self-driven on a freshness cadence, or external-driven (a gateway turning an ingress event into an edge).

Reactor compiles that set of contracts once (intelligently — Forme topology, a per-node canonicalizer, postcondition validators, all frozen), then runs them forever (dumbly — compare fingerprints, skip / render / propagate). The reconciler that decides *whether to wake* is deliberately deterministic: **there is no judge step.** The memo key has no clock in it. A render that can't satisfy its postconditions commits nothing — the prior truth stands and a `failed` receipt records why.

> **You do not need React to use this.** Reactor is React-*flavored*, not React-gated: the contracts are Markdown, and the CLI, the receipts, and the keyless replay are entirely React-free. The whole product in two sentences — *you declare what should stay true, the system watches the world, and it does expensive model work only when something material actually moved.* The table below is an optional mental model for the people who already carry one; skip it freely.

<details><summary>Optional: the React metaphor (skippable)</summary>

If you know React, you already know the shape — substitute three nouns:

| React | Reactor |
| --- | --- |
| Component | **Responsibility** — a declared standing goal |
| DOM | **World-model** — the maintained truth, on disk, passed by pointer |
| `render()` | **A bounded LLM session** that computes the next world-model |
| props | **Subscriptions** to other responsibilities' outputs |
| `React.memo` (skip if props unchanged) | **Skip the render if subscribed inputs haven't moved** |
| Manual dependency wiring | **Forme** — the graph wires itself from declared contracts |

The intelligence is frozen ahead of time, at compile, into a per-node canonicalizer and the Forme wiring. The reconciler at run time is dumb on purpose.

</details>

> ### Coming from OpenProse (v0.14 or earlier)? Read this first.
>
> The Intelligent-React overhaul (`runtime_contract 1 → 2`) is a **breaking** vocabulary change. The headlines:
>
> - **The judge loop is retired wholesale.** The old judge → verdict → pressure → fulfillment loop is gone, replaced by a deterministic reconciler — a render runs only when a node's subscribed input fingerprints or its own contract fingerprint move. There is no LLM in the wake/commit decision.
> - **Kinds renamed/deleted.** `kind: service` is **renamed to `kind: function`** (`### Parameters` → `### Returns`); `kind: system` is **deleted** (composition is now intra-node ProseScript `call` or cross-node subscription, wired by Forme); `kind: responsibility` is **reshaped** into a mounted DAG node that gains `### Requires` + `### Maintains`. `### Ensures` is **renamed to `### Maintains`** (now the world-model schema, not just an output list); `### Criteria`/`### Memory`/`### Fulfillment` fold in.
> - **Old ledgers are abandoned, not migrated.** Existing runtime data — old `ReceiptV0` ledgers, the policy registry, bundled `runs/`/`state/`/`dist/` — is **greenfield**: there is **no data migrator**. Only your **source text** upgrades. Re-run from a clean state-dir.
> - **Upgrade your source with a dry run first.** `prose upgrade --dry-run` (a prose skill command, run inside an OpenProse session — not the reactor CLI) inspects your files and reports the concrete migration plan **without editing** — mechanical rewrites where safe, surfaced as manual-review diagnostics where judgment is needed (e.g. a `system`/`### Wiring` flatten-or-split). Run it before `prose upgrade`.

> **Versions (live on npm):** `@openprose/reactor` 0.3.0 ·
> `@openprose/reactor-cli` 0.2.0 · `@openprose/reactor-devtools` 0.2.0. The `reactor` binary ships from the
> **`reactor-cli`** package, so `reactor --version` prints the CLI version (0.2.0), not the
> SDK version (0.3.0) — expected, not a mismatch.

## Quickstart (60 seconds, no model key)

> **Onboarding an agent on behalf of a user?** Follow these four steps in order. The binary is **`reactor`**. Step 2 is the keyless proof (no key, no spend); steps 3–4 are scaffold-and-go. That's the whole path — the rest of this README is reference.

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

**2. See the thesis — keyless, no model call.** Replay a saved sample run (synthetic, illustrative tokens) and read the per-node `rendered`/`skipped` dispositions, the receipt counts by `surprise_cause`, the token **cost rollup**, and per-node chain-verify:

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
# local install? prepend: npx reactor … (see the "Local install?" note above)
reactor init my-project && cd my-project
reactor doctor                          # what's present + the exact fix for anything missing
reactor compile --check; echo "exit=$?" # offline; exits 1 if the contract set is STALE (CI-wireable)
```

Author your OpenProse contracts as `*.prose.md` files under the scaffold's `src/` — a `kind: responsibility` per standing goal (its `### Maintains` / `### Requires` / `### Continuity`), optional gateways for ingress, optional functions for stateless helpers. `reactor compile` runs Forme over them.

**4. Go live (needs a model key).** These steps reach the model surface — set `OPENROUTER_API_KEY` and the two optional peers; a keyless reader can stop at step 3.

```bash
npm i -g @openai/agents zod          # the two optional live peers
reactor compile                      # Forme wires the DAG; freezes per-node canonicalizers
reactor serve --http 8080            # drive the scaffold's static gateway to a real receipt
reactor-devtools .reactor --describe # replay YOUR live run's ledger
```

> Use `reactor serve` (not `reactor run`) to drive a scaffold's **static** gateway — `serve`
> ingests its seeded items; `run` is for graphs whose connectors emit on their own.

## The SDK: one call, then go deeper

Reactor is a real SDK you plug into your own stack — not a closed product. The public API is a **curated front door**: `import { reactor } from "@openprose/reactor"`. One call takes a directory of `.prose.md` contracts all the way to a booted, reconciling reactor and hands back **one typed `Reactor` handle**.

```ts
import { reactor } from "@openprose/reactor";

// Compile ./my-project, assemble a durable reactor over ./state, boot to a fixpoint
// (cold nodes render once; warm nodes memo-skip), hand back a live handle.
const { reactor: r } = await reactor("./my-project", { directory: "./state" });

console.log(r.ledger.all().length);   // the receipt trail
await r.ingest("source", { wake: { source: "external", refs: [] } });
```

That's the front door. The deeper surface lives behind six reasoned subpaths — `.` (the facade + the vocabulary a driver needs), `/agents` (the full `@openai/agents` escape hatch — every render knob passes through), `/adapters` (the substrate + record/replay injection seam), `/run` and `/run/types` (the offline boundary), and `/internals` (the engine room). The full API reference is the **[SDK README](packages/reactor/README.md)** and the docs site — this page just opens the door.

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

This honesty is the point. The harness is young, should be used with caution, and has some way to go before it reaches its ideal form. There's nothing new here — we're applying classical engineering paradigms to our brave new world, and finding that despite our topsy-turvy reality, the wisdom of the ancients still applies.

## OpenProse runs anywhere; Reactor is the fast path

The `.prose.md` contracts in these examples are **harness-agnostic** — OpenProse Markdown runs on any Prose-Complete agent host (a fresh `git clone` is a first-class experience). The contract is the public artifact; the deployment's secrets and data stay private. Nothing is held hostage: a contract and its trail can leave for any compliant host with no lost meaning.

Reactor is the harness **built to run** that contract well — the deterministic host that compiles, runs, and inspects standing responsibilities, keeps the world-model up to date, and gives you the receipts. We strongly encourage authoring your OpenProse with Reactor — it's the recommended fast path — while OpenProse itself stays free, MIT, and portable, forever.

## Send us the thing it can't do yet

My ask is the one from every honest tool: try it, wire it up to something useful, love it or hate it, and send honest feedback. The most useful thing you can hand us isn't a compliment or a flattering benchmark — it's a **responsibility the harness *should* keep and doesn't**: a standing goal that breaks the surprise story, a wiring Forme gets wrong, a domain where this falls apart. The short guide to authoring one from the public SDK is **[`packages/reactor/EVALS.md`](packages/reactor/EVALS.md)** (shipped inside the SDK tarball too). We're always listening and improving.

- [Issues](https://github.com/openprose/prose/issues) · [Contributing](CONTRIBUTING.md) · [MIT License](LICENSE)
- [Privacy Policy](PRIVACY.md) · [Terms of Service](TERMS.md)

---

*The conversation always ends. The responsibility shouldn't have to.*
</content>
</invoke>
