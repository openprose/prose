# Reactor: React, for keeping a world-model true as the world moves

#### An open-source harness for standing AI responsibilities — where cost scales with surprise, not the clock

*By the OpenProse team · 2026-06-01*

---

## TL;DR

Reactor is a small, open-source harness (`@openprose/reactor`) for AI work that has to *keep being true* after a chat ends. You declare the truths you want maintained as OpenProse **Responsibilities**; Reactor keeps a composed **world-model** up to date against a changing world, re-rendering only the responsibilities whose inputs actually moved, and leaving a content-addressed **receipt** behind every decision. If you know React, you already know the shape: it is `React.memo` applied to expensive LLM work — declarative components, a maintained tree, and a deliberately dumb reconciler that skips everything that didn't change. This is the **next step for OpenProse**, not a turn away from it: the missing piece nearly every contract we wrote was pointing at. This report is mostly about the architecture: the metaphor that *is* the design, the components worth a close look, and an honest account of where Reactor is and isn't an RLM, and why nothing on the market is a drop-in replacement. We're publishing the harness before we publish benchmarks, on purpose — the mechanism is built, runnable, and reproducible; the numbers are the next thing we want help designing, not the thing we're leading with.

**New here?** Read §1–§3 for the idea, then run the one keyless command below. **Came from OpenProse?** §4 is where the through-line lands — this is the dependency-across-runs layer your contracts kept asking for.

---

### See the proof in one keyless command

Don't take the metaphor on faith — run the proof first. Replay a saved run's receipt ledger with no model key and no model call. Only this replay step is keyless; the live steps below (compile/serve/run) need a key.

```bash
# all three packages are live on npm; the keyless replay needs no install at all:
npx -p @openprose/reactor-devtools reactor-devtools --example masked-relay --describe
# (for the full CLI: `npm install @openprose/reactor @openprose/reactor-cli
#  @openprose/reactor-devtools`, then call `npx reactor …` — or `npm i -g` the three,
#  which is collision- and EACCES-prone; see the README install notes.)
```

You'll see the thesis made checkable:

```
dispositions  rendered=46 · skipped=31 · failed=0
surprise-cause  external=8 · input=69   (a.k.a. wake-cause)   ← receipt COUNTS, 77 total

COST ROLLUP  (tokens)
  total       fresh=27180 tokens · reused=12840 tokens · reuse=32%
    external  receipts=  8 fresh=   1080 tokens reused=840 tokens
    input     receipts= 69 fresh=  26100 tokens reused=12000 tokens
CHAIN-VERIFY ok
```

Forty-six renders, thirty-one memo-skips at zero fresh cost, and a chain-verified ledger — "cost scales with surprise," with no key. Read the two blocks separately: the `surprise-cause` line **counts receipts** by what woke them (8 external + 69 input = the 77 total receipts) — it is *not* a token figure. The **cost rollup** below it is the token spend: `fresh` is what each surprise actually cost, `reused` is what memoization saved (32% of the would-be token total). (`--describe` lists only the surprise-causes actually present in this ledger; a self-clock wake would add a `self` bucket.)

`masked-relay` is one of **13 examples that ship a committed `replay/` ledger** you can replay the same way (`research-tree`, `monorepo-ci`, `inbox-triage`, `agent-observatory`, a tamper-evidence walkthrough, and more), spanning a deliberately wide spread of DAG shapes and domains. (The examples directory holds more contract-only scenarios without a committed ledger; the thirteen are the ones with a replayable trail. Two of the thirteen — `masked-relay` and `tamper-forge` — share a **byte-identical** ledger, because `tamper-forge` is an audit *lens* over the masked-relay receipts, so the set is **twelve distinct datasets plus one tamper-evidence lens**.) Every one is covered by an offline test that runs at zero model spend.

A keyless reader can stop here; the live steps need a key. Visual reader? `reactor-devtools --example masked-relay` (drop `--describe`) boots a browser DAG viewer at a localhost URL — nodes flash on render, dim-pulse on memo-skip, with a live cost meter. Running ops? `reactor serve --http` exposes the same surface over HTTP (see §5 on ingress). Then read on for the metaphor that *is* the design.

---

## 1. Responsibility, not task

The last two years of agents have been a story about **tasks**. The tools most of us use every day are genuinely good at them: point one at a bug and it finds the bug, writes the fix, runs the tests, and explains what it did. A task has an edge. It begins when you ask and ends when it's done, and the agent is brilliant inside that edge and simply gone outside it.

Most of what an organization actually needs from software is not shaped like that. *The incident channel has a current briefing. Renewal risk is visible before the meeting, not after. Audit evidence is fresh enough to pass review. A competitor's funding is something we already know about.* None of those is a task you finish. Each is a **responsibility** — a claim about the world that has to stay true while the world keeps moving.

The distinction is the whole design, so it's worth stating precisely:

> A goal is a point-in-time requirement. A **responsibility** is a *standing* goal — a goal that must remain true over time.

This isn't a hypothetical category we invented to have something to sell. Across the OpenProse contracts people have been writing in the wild, the shape recurs: "keep this supplied with qualified accounts," "stay prepared to act on this market" — *keep* and *stay*, not *run once*. The missing piece was never the intelligence to do the work. It was the part where a system *stays responsible* for something after the conversation is over.

## 2. Why now: efficient tokens, not just tokens

There are two ways people fake a responsibility today, and both fail in the same place.

You can put a model on a **schedule** — a cron job that re-asks the same question every hour. It works, and it pays full price every single time, including the twenty-three hours a day when nothing changed. Your bill scales with the clock, not with reality. Or you can set an **alert** — cheap, but blind, because an alert only catches the things you already knew to watch for, and the reason you wanted an *intelligence* watching is that it might notice what you didn't think to specify.

Reactor's design principle is a third option:

> A normal loop asks *"what should I do next?"* — and cost scales with wall-clock time. A Reactor-class harness asks *"given this responsibility, and what just moved, what reconciliation is now justified?"* — and **cost scales with surprise.**

A world that sits still costs almost nothing to keep watched. Real model work appears when the world hands the system something genuinely new — plus a bounded, forecast-paced audit floor, so that "quiet" never silently becomes "asleep." That floor is a named, accounted-for line item, not a hidden meter.

For a while this was a quiet preference. It is becoming an urgent one. The first wave of AI tooling was priced for a world where the cost of a token only ever falls, and a great many always-on workflows were built on that assumption. That assumption is now being tested. The buyers we talk to have stopped asking for unlimited spend and started asking for the math — *match the right model to the right work, and show me it's cheaper than the alternative.* If nothing happened in the world, the cheapest conversation is not a shorter one. It is no conversation at all. Most of the industry is making the meeting shorter. We're asking why you're holding the meeting when there's nothing to discuss.

The rest of this report is how we made that structural instead of aspirational.

## 3. The shape: React, the world-model, and intelligent memoization

Here is the part that makes the whole thing legible if you've ever written a React component.

React keeps the DOM consistent with declared component state, re-rendering only what changed. Substitute three nouns and the entire architecture follows. **This is `React.memo`, applied to expensive LLM work.**

If you've never written React, none of the rest of this section is load-bearing for *using* Reactor — the React metaphor is a fast on-ramp for the people who already carry that model, not a dependency. The product is **React-flavored, not React-gated**: the contracts are Markdown, and the CLI, the receipts, and the keyless replay are entirely React-free. The whole thing in plain terms: you declare the truths you want kept current, the system watches the world, and it does expensive model work only when something material actually moved. That sentence is the complete user-facing mental model; the table below is optional color for the React-fluent.

| React | Reactor |
| --- | --- |
| Component | **Responsibility** — a declared standing goal |
| DOM | **World-model** — the maintained truth, materialized |
| `render()` | **A bounded LLM session** that computes the next world-model |
| props | **Subscriptions** to other responsibilities' outputs |
| `setState` / re-render trigger | **A new signed receipt** on a subscription |
| Reconciler | **The reconciler** — fingerprints inputs, schedules, commits |
| `React.memo` (skip if props unchanged) | **Skip the render if subscribed inputs haven't moved** |
| Commit phase | **Sign a receipt, persist the world-model, notify dependents** |
| Manual dependency wiring | **Forme** — the graph wires itself from declared contracts |
| Selector / split context | **Facets** — fine-grained subscriptions to parts of a truth |
| `ReactDOM.render(<App/>, root)` | **The fixpoint** — the topology is itself a responsibility |
| The component tree | **The graph of responsibilities (a DAG)** |

Three pieces of that table carry most of the weight.

**The world-model is the universal noun.** Every responsibility maintains exactly one — its "DOM." It is standing (it persists between renders), it is what the *next* render reads as its prior state, and it is what *downstream* responsibilities subscribe to. Crucially, it is **state passed by pointer, not by context window**. The render is an agent session, and it does not get the world-model stuffed into its prompt; it is told *where* the truth lives and reads it as needed — the way you'd work against a repository, pulling in a file on demand rather than pre-serializing everything. The canonical world-model is a content-addressable artifact: by default a small directory of files, packaged into something hashable and versionable. Everything else — a SQL index for query, a vector store, a rendered dashboard — is a *derived projection* of that canonical truth, never the truth itself.

**Intelligent memoization.** Before a render runs, the reconciler fingerprints the responsibility's subscribed inputs and its own contract. If nothing moved, the render does not run — the reconciler records a cheap "nothing changed" receipt and spawns no session. The decision about *what counts as a meaningful change* is intelligent and pushed into the model (more on this in §5), but the decision about *whether to wake* is dumb, deterministic, and instant. The trick is small and it is the whole game: **the memo key has no clock in it.** It is exactly two things — the fingerprint of the responsibility's own contract, and the fingerprint of each input it subscribes to. If neither moved since the last receipt, there is nothing to do, no matter how much time has passed.

This is the line that separates Reactor from a content-hash `if-modified-since` cron job, so it's worth stating before §5 develops it. A naive content hash treats *any* byte that moved as a change — and a feed re-polled every three minutes moves bytes constantly: a fresh `fetched_at`, a new `request_id`, re-ordered keys, a rotated cursor. A hash over that always *looks* different, so "skip if unchanged" silently degrades back into "re-run every poll." The fingerprint Reactor compares is **not** a hash of the raw bytes; it is a hash of the *canonical* form produced by a per-node **canonicalizer** that was compiled, ahead of time and from intelligence frozen at compile, to **drop the immaterial fields** — `fetched_at`, request ids, cosmetic ordering — and keep only what the contract declared material. That compile-time canonicalization is the actual edge over cron: it is why a busy-but-unchanged feed fingerprints *identically* across polls and memo-skips, where a plain content hash would re-render every time.

**The fractal.** Zoom into any responsibility and you find more responsibilities; zoom out and its output feeds still more. There is no privileged "sensor layer" or "dashboard layer" — every node at every scale is the same shape. World-models all the way down.

## 4. How we got here

We did not arrive at this in one shot, and it would be dishonest to present it that way.

The lineage is long. We've been building agent harnesses for about as long as that's been a category. The pattern of treating the filesystem as the heap — state by pointer, not in a context window — is something we've been writing about since well before the current generation of models. The shape of an agent as "a model with a REPL in a loop" is old news to anyone who was around for the first self-improving-script experiments. Somewhere in there the realization landed that the **harness** differentiates the outcome more than the model does — that the interesting design surface is the environment you put the model in, not the weights.

In **January 2026** we released **OpenProse**: a way to author intent as plain Markdown contracts — declarative specifications of *what should be true*, with an optional imperative layer (ProseScript) for the cases where order genuinely matters — and to push all the remaining decision-making into the agent. It turns a harness into something closer to a VM: it's just a prompt, no framework to install. It found an audience faster than we expected — past **5,000 installs**, a flood of feedback we couldn't keep up with, a **pre-seed from Y Combinator**, and a **first signed customer**. People built real things with it, and we built a lot with it internally.

And across nearly every OpenProse system we wrote — ours and other people's — we kept hitting the *same* missing piece. The contracts were good at saying what should be true in isolation. What they couldn't express was **dependency across runs** — an event-based architecture, a data-flow graph *between* responsibilities, so that when one maintained truth moved, the things that depended on it knew to reconsider. Every system was re-inventing a worse version of that wiring by hand. So this is not a pivot; it is the layer the language had been pointing at the whole time.

For existing OpenProse authors this is a **breaking** vocabulary change (`runtime_contract 1 → 2`): the judge → verdict → pressure → fulfillment loop is retired wholesale, `kind: service` is renamed to `kind: function`, `kind: system` is deleted, `### Ensures` becomes `### Maintains`, and old runtime data (the `ReceiptV0` ledgers, the policy registry, bundled `runs/`/`state/`) is **abandoned, not migrated** — only your source text upgrades, and there is no data migrator. `prose upgrade --dry-run` (a prose skill command, run inside an OpenProse session — not the reactor CLI) reports the concrete source-rewrite plan without editing anything; the README's "Coming from OpenProse?" box is the short version.

We prototyped the missing piece in our private cloud, and then we rewrote its core more than once. One learning from that process is load-bearing enough to state plainly, because it shaped everything that followed: **our first instinct was to put the intelligence in the runtime** — to let a model decide, live, on every wake, whether things had changed and what to do about it. It didn't hold. It was fragile exactly where it needed to be boring. The design we landed on does the opposite: it **freezes the intelligence ahead of time** — in the render and in the wiring — and keeps the runtime dumb, fast, and auditable. Then we pulled the guts of that prototype out into a relatively simple SDK, which is what we're open-sourcing.

That is the whole history this report needs. The rest is architecture.

## 5. The architecture, up close

The system has a clean cleavage: an **intelligent compile phase** that fires rarely (when contracts change) and freezes its judgments into deterministic artifacts, and a **dumb run phase** that fires on every wake and only executes those frozen artifacts. The slogan is *intelligence at compile time, determinism at run time* — and it is the direct payoff of the learning in §4.

**Two intelligent layers over a dumb reconciler.** React puts intelligence *nowhere* at runtime; both hard problems — *what should this component be* and *which components depend on which* — are solved ahead of time by the developer. Reactor puts intelligence in exactly two places and keeps the third dumb:

- **The render** — a bounded LLM session that computes the next world-model. Smart.
- **The wiring (Forme)** — resolving which responsibility depends on which. Smart.
- **The reconciler** — fingerprint, schedule, commit, propagate. **Dumb** — and deliberately so.

The reconciler never asks a model "did this change?" There is no judge step. That single discipline is what makes the run phase fast, predictable, and auditable.

**Fingerprinting, in three phases.** The apparent paradox — *decide a semantic question deterministically* — dissolves once you split it across time, exactly as React does (React's equality check is dumb `Object.is`; *which* values you list in a deps array is an intelligent decision made ahead of time). In Reactor: at **compile time**, a natural-language canonicalization spec written inside the contract is lowered into a deterministic **canonicalizer** — what's material, what's volatile-but-immaterial (timestamps, request ids, cosmetic ordering) and dropped, how text and sets and numbers normalize. At **render time**, the model produces data and self-polices its declared postconditions. At **wake time**, the reconciler runs the compiled canonicalizer and compares fingerprints. The fingerprint changes *if and only if* the canonical, material content changed — and "material" was frozen by intelligence at compile time, never judged at wake. This is the single highest-leverage control in the system: without it, a feed re-polled every three minutes always *looks* changed, and "cost scales with surprise" silently degrades back into "cost scales with the clock."

**The render atom.** The unit underneath everything is `(contract, evidence, prior world-model) → (new world-model, receipt)`. A responsibility declares what it needs (`### Requires`, as *contracts* — "I need a current view of competitor funding" — not as pointers to specific producers) and the shape of the truth it maintains (`### Maintains`). It runs standalone — give it evidence, it computes a world-model and signs a fingerprinted receipt, no harness required — or *mounted* as a node in the DAG, woken over time. Mounting is **additive**: it confers identity, a persisted world-model, and resolved subscriptions. A subtle but important point we spent a while getting right: **node-ness is conferred by mounting, never by statefulness.** A responsibility is in the graph because it was mounted as a subscribable producer, not because it holds memory — exactly as a React component is in the tree because it was rendered, not because it has `useState`.

**Facets: the selector boundary, made authorable.** A `### Maintains` can name independently-subscribable parts as sub-headings. A competitor-activity monitor might maintain `funding`, `hiring`, and `product-launches` as separate facets; a downstream that subscribes to *funding* does not wake when *hiring* moves. The part's name is the same name in three places at once — its fingerprint unit, its subscription symbol, and its subtree in the world-model directory:

```markdown
### Maintains
A current, corroborated view of each tracked competitor. Each competitor carries a stable
`name` and a `last_corroborated` field; `fetched_at` and source request-ids are immaterial.
Postcondition: every competitor cites a corroborating source.

#### funding
Funding events per competitor — round, amount, date. Material: the event set (unordered)
and each event's round/amount/date.

#### hiring
Open-role activity — the department set and the open-role count (exact).
```

*Structure is subscription.* Declaring no facets at all yields one atomic truth — the free default. This is React's split-context / selector distinction, made into something you author by writing a sub-heading.

**Forme: the graph wires itself.** Deciding which responsibility depends on which — by reading what each is *for* — is a judgment problem, not plumbing. Forme reads the full set of contracts, semantically matches each declared need to the producer(s) that satisfy it, and draws the subscription. The edges of the DAG are Forme's output, not hand-authored config. A need with no producer, or two equally-plausible producers, is a surfaced **diagnostic**, never a silent guess. When a better source appears or a live one dies, Forme rewires — and because a rewire is itself a render that leaves a receipt, every switchover is audited and self-healing. Forme enforces acyclicity as a postcondition on its *own* output: a topology that would close a loop is rejected and surfaced. Genuine feedback — a responsibility's output shaping its *next* input — is not a backward edge; it's a responsibility waking itself on its own clock. **Loops live in time, not in edges.**

**The receipt is the trust unit.** Every decision produces a content-addressed receipt that names its evidence *by fingerprint*, points to the prior receipt, and records what changed and why. The ledger of receipts is the responsibility's durable memory — append-only and chain-verifiable. This is the structural commitment nothing else in the category makes, and it's worth being precise about why it matters: a transcript can tell you what was *said*; it cannot tell you, six months and ten thousand turns later, why one specific decision was made without you finding the right moment in a river of text and trusting it was never edited. A receipt can. It is the difference between *trust me, I'm an AI* and *here is the evidence, check it yourself.* The receipt is also **the next process's state**: stop the system cleanly and restart it, and it rebuilds its memo-state from the committed trail — every node it had already settled stays settled, so a restart re-renders only what genuinely moved while it was down. Continuity lives in the ledger, not in a session that has to stay alive. To be precise about the boundary: this is **clean-restart / memo-state survival**, not crash-recovery of in-flight work. A render that was interrupted mid-flight leaves no committed receipt, so on restart that node simply wakes and re-renders from its last *committed* state — the ledger is append-only and there is no fsync barrier, so the guarantee is "the committed trail is the durable truth," not "no in-flight work is ever lost."

**A property worth pausing on: topology change is free.** Because a responsibility's memo key is `(contract-fingerprint, input-fingerprints)`, you don't need a special mechanism to roll out a new wiring. A rewire changes which producer fills a subscriber's input slot, which moves that slot's fingerprint, which moves the memo key — so adopting a new topology produces memo-misses at *exactly* the rewired nodes and skips at every other node, for free. The memo key already treats "my wiring changed" as "my inputs moved." We didn't design this; it fell out of the shape, which is usually the sign a shape is right.

**How the world gets in: ingress.** A render reconciles against evidence, which means something has to deliver that evidence. External arrivals enter through **gateways** — declared entry points that a **connector** feeds. The built-in connectors are *pull-based*, polling a source on a cadence: `static` (a fixed list, for scaffolds and tests), `http` (`GET` a URL), and `file` (watch a directory of JSON). For everything push-shaped, there is a manual ingress path: `POST /<node>/trigger` on the running `serve` host wakes a node with an attached payload. Queues and webhooks integrate via that trigger endpoint or a small custom connector — we do *not* ship a Kafka or streaming connector; the honest surface today is pull-on-a-cadence plus a manual/webhook trigger. A connector advances a per-source cursor as it ingests, so a restart resumes from the cursor rather than replaying the whole backlog. The honest delivery semantics are **at-least-once with a memo-skip**, not exactly-once: an arrival that was fetched but whose cursor advance didn't durably land before a restart can be re-delivered — but because the memo key hasn't moved, the re-delivery renders nothing and costs nothing. The skip absorbs the duplicate; we don't claim exactly-once ingestion.

**The fixpoint (where the tower closes).** Wiring the graph is itself intelligent work that produces a maintained truth — the topology — so it is *a responsibility like any other*. Its world-model is the resolved DAG; its render is Forme. The reconciler reads *that* responsibility's world-model to schedule every node, including the one that draws the graph — bootstrapped by a tiny deterministic seed, almost literally `ReactDOM.render(<App/>, root)`. This is what lets the system respond to the world by re-wiring *itself*: a new competitor appears, and a tracker is spawned and wired, with every rewire a signed receipt. The recursion terminates because **surprise decays with height** — the world moves often, the set of contracts rarely, the wiring-of-contracts almost never — and because it rests on a deterministic floor. This is the most ambitious part of the design, and in the current build it is **specified and deferred**: the substrate is in place, but mounting the compile phase as a live responsibility is the next milestone, not a shipped one. We'd rather say that plainly than imply the tower is already closed.

## 6. Is it an RLM? An honest accounting

Recursive Language Models are having a moment, and the comparison is fair to draw — so let's draw it honestly, including the parts that don't flatter us.

The strict definition is specific: an RLM is a model with access to a REPL, where the REPL has a method for calling an RLM — *real* recursion, a model decomposing a problem by spawning sub-models on slices of context, not a flat fan-out of subagents. By that bar, here is where Reactor lands.

**Ways Reactor is RLM-class:**
- **State is passed by pointer, not in-context.** The world-model is a filesystem/git directory; sessions get references and read what they need. This is the defining RLM move — context as *environment*, not as tokens.
- **Meta-sessions manage ReAct sessions.** The reconciler is a loop that drives bounded child agent sessions; layers of ReAct sit under a managing layer.
- **Every agent has a shell over the full system state as a git repo** it can write code against. The sandbox is the tool; the filesystem is the truth, and a truth you can't lie about because it's all on disk.
- **Cost scales with the complexity of what changed, not the size of the input** — the RLM literature's central economic property, which Reactor inherits by construction.
- **The recursion is real, but structural.** It lives in the composition DAG — zoom in, more nodes; zoom out, the output feeds more — and it's memoized across that structure rather than re-derived.

**Ways Reactor is *not* a fully generalized RLM:**
- **The recursion is not a model spawning sub-RLMs at runtime to crack a single giant prompt.** Reactor doesn't slice a ten-million-token variable in the loop; it watches fingerprints of bounded world-models. That deep, in-context decomposition — the thing the RLM papers are really about — is not what Reactor does.
- **Depth beyond one level is not the value proposition.** RLMs shine on long-context, information-dense aggregation. Reactor's value is standing reconciliation plus memoization across a graph — a different axis.
- **We sidestep the hard open problem rather than solving it.** Getting today's models to reliably *use* recursive sub-calls is a post-training problem the field hasn't cracked; models default to flat tool calls. Reactor doesn't fight that. By freezing intelligence at compile time and making the recursion structural, it gets RLM-class economics without depending on a capability that isn't reliable yet.

So: arguably an RLM, and if not a fully generalized one, then a harness that draws on many RLM-class principles. The value we're claiming is the harness, not a claim to have solved recursion — and we think being clear about that line is more useful to you than blurring it.

## 7. Why existing solutions don't replace it

The honest comparison is structural, not competitive. Each of these made defensible choices for its own problem.

| | **Cron / scheduled loops** | **Prompt-loop harnesses** (coding assistants, naive ReAct) | **Dynamic workflows** (plan-and-execute) | **Reactor** |
| --- | --- | --- | --- | --- |
| Control model | Fixed-interval polling | Imperative loop, "what next?" | An imperative plan, generated then strictly executed | Declarative: declare the truths to keep current |
| Where orchestration lives | An external scheduler | Inside one running session | A plan executed *from outside* the agents | Pushed *into* the agents; the DAG is Forme's output |
| Lifetime | Standing but stateless | One session, then gone | One-shot: plan → execute → discard | A standing DAG that persists across runs |
| State | None (re-fetch each tick) | Linear context in-window | The plan / conversation | World-model by pointer; receipts as durable ledger |
| Cost scaling | With the clock | With conversation length | With plan/agent count | With **surprise** (re-render only on material change) |
| Auditability | Logs | "Scroll back and hope" | A plan trace | Content-addressed receipts naming evidence by fingerprint |
| Best fit | Simple recurring jobs | Interactive, bounded tasks | Orchestrating N calls in order | Keeping a standing set of responsibilities aligned with a changing world |

Cron is the thing Reactor most directly improves on — same standing posture, but it pays for surprise instead of for the clock. The prompt-loop harnesses are the standing/memoized *evolution* of: take the loop you already run, and give it a durable world-model and a memo key.

The comparison everyone will reach for is **Anthropic's dynamic workflows**, launched days before this writing — mention "workflow" in a prompt and the model builds an orchestration plan it then strictly follows, even across hundreds of agents. We think this is genuinely good, and we don't think it's the same thing, so the honest framing is a different question rather than a better answer:

> Dynamic workflows answer *"how do we plan and execute a sequence of calls?"* Reactor answers *"how do we keep a standing set of responsibilities aligned with a changing world?"*

One generates an imperative plan and runs it to completion; the other maintains a declarative graph that wakes, reconciles, and goes quiet, indefinitely, paying only for what moved. They compose more naturally than they compete — a dynamic workflow is a perfectly good way to *fulfill* a single responsibility's render. Different problem classes.

And we'll name the bet, because this audience will name it for us if we don't: if it turns out that almost all valuable agent work in production is bounded, imperative sequences, then plan-and-execute wins and a standing reconciler is over-engineering. The evidence we see — people authoring standing goals, accumulating durable memory, refreshing daily — bets the other way. But it's a bet, not a proof.

## 8. Why we're open-sourcing it

We built Reactor for our own use, ran it privately, and then decided to open it. The runtime, the language, and the skill are open source, and the SDK core has zero runtime dependencies by design — the live render needs two optional peers (`@openai/agents`, `zod`), pulled lazily only when you compile or render. Part of the reason is principled: we ❤️ open source, and we think infrastructure this foundational shouldn't be something you rent from whoever also sells you the model — an open, inspectable harness is a small counterweight to the concentration of that stack. Part of it is strategic in the ordinary commoditize-the-complement way that open frameworks have always been.

But the most relevant reason is the one that ties back to §2. The buyer who has gotten wise about spend wants *the math* — and it is worth being precise about which math the receipts give you and which they don't. What the receipts and the test assertions prove is the **invariant**: a render runs *if and only if* the memo key moved, so a quiet world bills nothing, checkably, on a ledger you can re-verify. What they are **not** is a *measurement* — a cost-vs-baseline number that says Reactor beats a cron loop by some factor. That benchmark is honestly deferred (§9); we will not pass off a structural invariant as a measured speedup. The keyless `reactor-devtools` cost rollup reports **tokens** (fresh vs reused), split by `surprise_cause`, that you can price against your own model's per-token rate — the conversion is yours to run, on a ledger you can re-verify. An auditable harness is exactly what you want underneath work you intend to leave running unattended. You shouldn't have to take our word for the invariant; the point of the whole receipt architecture is that you don't — and you shouldn't take our word for a speedup either, which is why we haven't claimed one.

That's also why we're releasing it rough, now, rather than after a benchmark sweep. We'd rather get the *shape* in front of people who will tell us where it's wrong than hill-climb a number in private and discover later it didn't survive contact.

## 9. What's built, and what isn't

In the spirit of the receipts: here is the honest status.

**Built and runnable.** The render atom, the world-model store (content-addressed, with the published-truth / private-workspace split), the compiled canonicalizer with facets and a structured-backing lint, Forme's wiring with diagnostics and acyclicity, postcondition-gated commits with no judge step, the receipt ledger with chain verification, composition pins, and the forecast/continuity scheduler are all implemented and exercised by the test suite, which runs offline — no model calls in the commit gate — in about a second. The reconciler's surprise property is enforced as a *tested invariant* rather than asserted as a statistic: when an input fingerprint doesn't move, the render body provably never runs. Integration suites prove the behaviors that matter for a graph of responsibilities — read-isolation (a node cannot read a sibling it didn't subscribe to), selective wake, the diamond single-wake (one wake from several inbound paths), and survival across a process restart. **Thirteen end-to-end examples** ship with the repo, each with a committed, chain-verifiable ledger and an offline test that drives the real reconciler at zero spend. The SDK core is zero-dependency (the live render pulls `@openai/agents` and `zod` as optional peers), strict-typed, published with provenance, and deterministic enough that its replay tests check exact hashes.

**Deliberately not yet here.** We do not have benchmark or dollar numbers, and we're not going to pretend a structural invariant is a measured speedup — designing honest long-horizon benchmarks for systems like this is genuinely unsolved, and it's the help we most want from you. The fixpoint (§5) is specified and deferred. The cryptographic signer is a stub: in this version "signed" means the receipt chain is attributable and tamper-evident at the meaning layer, not non-repudiable at the byte layer. And a disclosure that belongs right next to the signer caveat: a **v1 receipt carries no timestamp and no actor** — it records *what* changed and *why* (fingerprints, wake cause, status, cost), but not *when* it was committed or *who* committed it. So the ledger is a verifiable record of decisions and their evidence, but it is **not yet a substitute for an external audit log** that needs to answer "at what time, by which principal." Facet *inference*, ledger compaction, and a few production-grade ingress concerns are named roadmap, not shipped.

And the load-bearing caveat, stated once more so it isn't buried: cost-scales-with-surprise depends on evidence having a **stable, semantically-meaningful identity** and on that bounded audit floor. In a domain where "did the relevant content change?" has no cheap, reliable answer, Reactor degrades toward a scheduled loop with better bookkeeping. We think that's still useful — you get the receipts either way — but it's not magic, and the cost story is weaker there.

## 10. What we're asking for

If you maintain something that has to stay true while the world keeps moving, the fastest way in is the `reactor` binary, with the keyless `reactor-devtools` replay as the first thing to run — it shows the memo-skips, the cost-by-surprise rollup, and chain-verify on a sample ledger without a model key (the README carries the quickstart, and there are thirteen examples to replay). The most useful thing you can send us is not a compliment, and it is not a benchmark that makes Reactor look good. It is a **responsibility, and an evaluation, where the harness *should* pass and does not yet** — a standing goal we can't keep, a domain where the surprise story breaks, a wiring Forme gets wrong. There's a short guide to authoring one from the public SDK — drive the reconciler, wake a graph, read back the dispositions and the cost rollup — at [`packages/reactor/EVALS.md`](https://github.com/openprose/prose/blob/main/packages/reactor/EVALS.md). That is how we find the edges, and finding the edges in the open is the entire reason we're shipping this rough.

The harness is small on purpose. The bet underneath it is not: that the unit worth optimizing is not the conversation but the world, that you should pay for surprise and not for time, and that a thing you intend to leave running should hand you a receipt for every decision it makes on your behalf.

The conversation, eventually, always ends. The responsibility shouldn't have to.

---

*Reactor is open source. The runtime is `@openprose/reactor`; it's built on OpenProse, where intent is authored as Markdown contracts. Vibe-check it, break it, and send us the responsibility it can't keep yet.*
