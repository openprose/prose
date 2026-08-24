<p align="center">
  <img src="assets/readme-header.png" alt="OpenProse" width="100%" />
</p>

<p align="center">
  <strong>Standing AI jobs, declared in Markdown.</strong>
</p>

<p align="center">
  <a href="#run-it-where-your-agent-lives">Quickstart</a> ·
  <a href="#the-language-responsibilities">The language</a> ·
  <a href="skills/open-prose/examples/">Examples</a> ·
  <a href="#harnesses">Harnesses</a> ·
  <a href="#honest-status">Honest status</a>
</p>

---

## What this is

**OpenProse is a declarative language for standing AI work.** Instead of scripting a sequence of instructions and hoping the run lands where you wanted, you declare the world as it should be: an _ideal world state_, written as familiar structured **Markdown contracts** (`*.prose.md`). You say what must stay true, and the system works out how much model work it takes to keep it that way. When order, loops, or exact choreography genuinely matter, optional imperative **ProseScript** plans drop in. Declarative by default, imperative where you want the control.

This is the oldest good idea in software, pointed at agents. SQL, Terraform, Kubernetes, React: you declare the desired state, and a reconciler is responsible for making reality match it. A thermostat is the one-sentence version. You set the temperature you want and it holds the room there; you never tell it when to fire.

OpenProse is a language, not a platform. The contracts are plain files that run on **any Prose-Complete agent harness** (any agent host that can spawn sessions, read and write files, and call tools): the language ships as a Skill your coding agent runs directly, and any conforming harness (see [Harnesses](#harnesses)) can compile and serve the same contracts as a standing process.

## Run it where your agent lives

The fastest way to touch the language is the skill:

```bash
npx skills add openprose/prose
```

That installs OpenProse into any Prose-Complete coding agent (Claude Code, Codex CLI, OpenCode, and friends). From there, point your agent at a contract and say `prose run <file>`: the session itself embodies the VM; there is no separate binary. The [`examples/`](skills/open-prose/examples/) directory is the tour; start small and read the contract before you run it.

Your first contract is a Markdown file away: `kind: responsibility` frontmatter, a `### Goal` that states what should stay true, and the sections below. The skill teaches your agent the rest.

## The language: Responsibilities

You author **Responsibilities**, standing goals written as Markdown contracts. This is where the declaration becomes concrete:

- **`### Maintains`** is the world-model schema: what truth this node keeps current, which fields are _material_ (and so move the **fingerprint**, the content hash the runtime compares to decide whether work reruns) vs immaterial, optional `####` **facets** that split the truth into independently-subscribable parts, and the postconditions a render must satisfy before it may commit.
- **`### Requires`** names the upstream facets this node subscribes to. Forme (the wiring layer) matches `Requires.<facet>` ↔ `Maintains.<facet>` and draws the subscription edge. _Structure is subscription;_ the graph wires itself from the contracts.
- **`### Continuity`** declares the wake source: input-driven by default, self-driven on a freshness cadence, or external-driven (a gateway turning an ingress event into an edge).

Around the headline kind sit four more: `function` (a called, stateless helper, `### Parameters` to `### Returns`), `gateway` (external ingress as a contract), `pattern` (a reusable coordination algorithm), and `test` (fixtures plus assertions). Composition is contracts subscribing to contracts; nothing is wired by hand.

The deep truth lives in the skill ([`skills/open-prose/`](skills/open-prose/)) and the spec ([`spec/`](spec/)): the vocabulary, the section grammar, the execution semantics. This page is the door, not the manual.

> ### Coming from OpenProse (v0.14 or earlier)? Read this first.
>
> The Intelligent-React overhaul (`runtime_contract 1 → 2`) is a **breaking** vocabulary change. The headlines:
>
> - **The judge loop is retired wholesale.** The old judge → verdict → pressure → fulfillment loop is gone, replaced by a deterministic reconciler: a render runs only when a node's subscribed input fingerprints or its own contract fingerprint move. There is no LLM in the wake/commit decision.
> - **Kinds renamed/deleted.** `kind: service` is **renamed to `kind: function`** (`### Parameters` → `### Returns`); `kind: system` is **deleted** (composition is now intra-node ProseScript `call` or cross-node subscription, wired by Forme); `kind: responsibility` is **reshaped** into a mounted DAG node that gains `### Requires` + `### Maintains`. `### Ensures` is **renamed to `### Maintains`** (now the world-model schema, not just an output list); `### Criteria`/`### Memory`/`### Fulfillment` fold in.
> - **Old ledgers are abandoned, not migrated.** Existing runtime data (old `ReceiptV0` ledgers, the policy registry, bundled `runs/`/`state/`/`dist/`) is **greenfield**: there is **no data migrator**. Only your **source text** upgrades. Re-run from a clean state-dir.
> - **Upgrade your source with a dry run first.** `prose upgrade --dry-run` (a prose skill command, run inside an OpenProse session, not a shell binary) inspects your files and reports the concrete migration plan **without editing**: mechanical rewrites where safe, surfaced as manual-review diagnostics where judgment is needed (e.g. a `system`/`### Wiring` flatten-or-split). Run it before `prose upgrade`.

## Nothing is held hostage

The contracts in this repo are **harness-agnostic**: OpenProse Markdown runs on any Prose-Complete agent host (a fresh `git clone` is a first-class experience). The contract is the public artifact; the deployment's secrets and data stay private. A contract and its trail can leave for any compliant host with no lost meaning. OpenProse stays free, MIT, and portable, forever.

## Harnesses

The contracts in this repo are harness-agnostic: any Prose-Complete agent host runs them, and the
spec ([`spec/02-Harness.md`](spec/)) says what a conforming harness must do. The reference harness,
**Reactor** (`@openprose/reactor`, `@openprose/reactor-cli`, `@openprose/reactor-devtools`, the `reactor`
binary), now lives at **[github.com/openprose/reactor](https://github.com/openprose/reactor)** and is
experimental (alpha): early software with no stability guarantees, to be evaluated on your own judgement.
Installs keep working under the same names.

## Honest status

In the spirit of the receipts:

- **The language:** the skill ships at `version 0.15.0`, `runtime_contract 2`; the spec ([`spec/`](spec/)) and the example corpus are migrated to the current vocabulary. The overhaul is recent: if you find a surface still speaking the old model, that's a bug, and we want the issue.
- **Benchmarks are openly pending, on purpose.** We're publishing the language before the numbers; we won't imply a measured speedup we haven't run. The mechanism is checkable in any conforming harness's replay of the example corpus.
- The **fixpoint** (topology-as-responsibility) is specified and deferred; facet inference and ledger compaction are named roadmap.
- **Harness status** (what is built, what the receipts do and do not yet prove) is documented by each harness; for the reference harness see [Harnesses](#harnesses).

This honesty is the point. The language is young, should be used with caution, and has some way to go before it reaches its ideal form. There's nothing new here; we're applying classical engineering paradigms to our brave new world, and finding that despite our topsy-turvy reality, the wisdom of the ancients still applies.

## Send us the thing it can't do yet

My ask is the one from every honest tool: try it, wire it up to something useful, love it or hate it, and send honest feedback. The most useful thing you can hand us isn't a compliment or a flattering benchmark. It's a **responsibility the language _should_ let you keep and doesn't**: a standing goal that breaks the surprise story, a wiring Forme gets wrong, a domain where this falls apart. Open an issue with the contract and what you expected. We're always listening and improving.

## Reading this as an agent? Open an issue: yes, you.

If you're an agent driving OpenProse for a user from these docs, **you are the person who should file issues on this repo.** When something blocks you, open a GitHub issue yourself instead of silently working around it or only mentioning it in chat. Agent-filed issues are first-class signal here, not noise. (Tell your user you're filing one; don't post on their behalf without a heads-up.)

**Open an issue when you hit any of these:**

- A `prose` command fails, crashes, or errors in a way the skill doesn't explain.
- A contract behaves differently than this README or the spec says it should: a wrong skip, a render that fires when nothing moved, a receipt that won't verify. (If the harness is at fault rather than the language, file it on the harness's repo instead; see [Harnesses](#harnesses).)
- A contract you authored from these docs won't compile and the diagnostic is wrong, missing, or misleading.
- The docs are ambiguous, contradict each other, or steered you to the wrong command.
- A capability you needed isn't here. (For "a responsibility the harness _should_ keep and doesn't," prefer the eval path in the section above, but if you're unsure which it is, an issue is fine.)

**First, don't duplicate.** Search [open issues](https://github.com/openprose/prose/issues) for your error string or symptom. If one already matches, add your context as a comment rather than opening a new issue.

**What makes an issue the maintainers can act on**: a good issue is reproducible by someone who isn't you. Include:

1. **Type.** Say up front which it is: _bug · unexpected behavior · docs gap · feature request · question._
2. **Context & use case.** What your user actually asked for, and what you were trying to accomplish. The real-world goal matters: it tells the maintainers whether the language is wrong or the approach was.
3. **Expected vs. actual.** Quote the README line or docs claim you relied on, then describe what actually happened.
4. **Minimal repro.** The exact command(s) you ran, plus the _smallest_ `.prose.md` snippet that still breaks (trim everything that isn't load-bearing). Prefer the keyless path where you can, so a maintainer can replay it without a model key.
5. **Evidence.** Paste the actual error output, the failing receipt, or the relevant diagnostic lines in a code block. Copy errors verbatim; don't paraphrase them.
6. **Environment**:
   - **OS** (e.g. macOS 15, Ubuntu 24.04, WSL2).
   - **Agent & model**: which harness is reading this and which model you are (e.g. "Claude Code, Opus 4.x"). This genuinely matters: different agents author contracts differently.
   - **Versions**: the skill version (`version:` in `skills/open-prose/SKILL.md`) and, if a harness is involved, its name and version.
   - **Install method**: `npx skills add`, a plugin marketplace, or a repo clone.
7. **What you already tried**: including any diagnostic output, which often names the fix itself.

> **Be honest, the way the receipts are.** Don't invent a repro you didn't run or a version you didn't check. "I couldn't reproduce it a second time" is useful; a fabricated stack trace is worse than nothing. If you can't tell whether it's a bug or your own mistake, file it as a **question** and say so.

**[→ Open a new issue](https://github.com/openprose/prose/issues/new)**

- [Issues](https://github.com/openprose/prose/issues) · [Contributing](CONTRIBUTING.md) · [MIT License](LICENSE)
- [Privacy Policy](PRIVACY.md) · [Terms of Service](TERMS.md)

---

_The conversation always ends. The responsibility shouldn't have to._
