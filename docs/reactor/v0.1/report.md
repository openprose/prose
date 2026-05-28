# Reactor: Cost Scales With Surprise, Not Time

Date: 2026-05-22 (v0.1.0 release)

## 0. TL;DR

Reactor is an agent harness for responsibilities that keep running after a chat session ends. Its loop fires on predicates over durable state, not on user prompts. Each turn emits a content-addressed receipt naming the contract, evidence, model usage, verdict, freshness, and cost. Because identical evidence reuses the prior verdict instead of asking the model again, cost scales with surprise — plus a bounded, forecast-paced audit floor — not the wall clock: in the static 24-hour Cradle scenario, Reactor reaches and maintains its verdict in 2 model invocations and 46 fresh tokens; with verdict reuse switched off — the same scenario, the same receipt schedule — it takes 4 invocations and 92 fresh tokens. Memoization halves both the model invocations and the fresh token spend, and the fresh spend stays flat across the day instead of climbing with the clock. The policy that drives the loop is model-authored but compiled into a deterministic kernel, so expressiveness and auditability live on opposite sides of an explicit seam. The result is inspectable rather than asserted: the public `46:46` demo is deterministic, and independent first-time evaluators have run the §9 recipe from clean clones and reproduced it byte-for-byte. The published packages, CLI examples, and deterministic evaluation suite let readers check the mechanism instead of trusting the claim.

## 1. The Problem We Are Trying To Solve

Most agent harnesses are built around a user-prompted loop: receive an instruction, gather context, act, and optionally verify. That architecture is exactly right for coding assistants and short-lived operational bursts. It is the wrong default for a responsibility an organization expects a system to keep maintaining: "the incident channel has a current briefing," "the release candidate is ready to ship," "customer renewal risk is visible before the meeting," or "audit evidence is fresh enough for the next review." Those states are not answers. They are maintained claims about a changing world.

OpenProse names that maintained claim a responsibility. The durable source is a `*.prose.md` contract — ordinary Markdown authorship over a small typed frontmatter, defined by the OpenProse language specification. The bundled examples show that shape directly in files such as [`incident-channel-current.prose.md`](https://github.com/openprose/prose/blob/reactor-v0.1.0-rc.2/skills/open-prose/examples/incident-briefing-room/src/incident-channel-current.prose.md). Reactor asks a different question from a normal agent loop: not "what should I do next?" but "given this responsibility, this event, the latest observations, and the prior decisions, what reconciliation action is now justified?"

The practical requirement follows from that shift. The system has to pay when the world changes, stay quiet when nothing material changed, and leave behind enough evidence that a future agent or human can tell why it checked, acted, slept, or escalated. A transcript is not enough. A prompt is not enough. A cron schedule is not enough. We need the maintained state, the evidence identity, the model cost, the decision boundary, and the next scheduled check in a durable artifact.

That is why Reactor exists. It is not an attempt to replace chat-based coding assistants; it is a different bet for a different use case. We want bounded model activations inside a deterministic runtime, not continuity hidden inside a long-running session. We want a policy that can be expressive because a model authored it, and cheap because the hot path executes a compiled artifact. We want cost to track information gain. And when the system cannot honestly decide, we want it to stop and say why.

## 2. How The Bet Differs From The Harnesses You Already Use

The comparison below is intentionally charitable. Claude Code, Codex, OpenClaw, Pi, and Hermes Agent each made defensible choices for their own use cases. Reactor differs because the maintained-responsibility use case pushes verification, policy, cost, and triggering into different places.

| Axis | Reactor's bet | Public harness docs tend to emphasize | What the other bet buys |
| --- | --- | --- | --- |
| Verification | Receipt-as-causal-proof is required to advance. | Prompted verification, transcript visibility, fallback behavior, or human loop control. | Flexibility: a coding assistant can inspect, repair, and ask the user without committing every step to a proof object. |
| Policy locus | Model-authored, compiled, kernel-evaluated policy artifacts. | Prompt context, project memory, filesystem skills, persona, or orchestrator configuration. | Editability and speed: prompt or skill policy is easy to change inside an interactive session. |
| Adapter seams | Model gateway and agent SDK are separate required SDK types. | Provider-integrated loops, per-turn executors, or many execution backends under one orchestration story. | Integration: one loop is easier to sell and easier to wire into an interactive tool. |
| Cost model | Cost is accounted as fresh work versus reused verdict proof. | Length, cache, compaction, summarization, provider choice, or subscription economics. | Operational pragmatism: caches and compaction are proven levers for long conversations. |
| Loop trigger | Predicate-tripped reconciliation over durable state. | User prompts, goal prompts, chat inboxes, scheduled turns, or consumer chat. | Responsiveness to humans: the system wakes because a person or channel asked for work. |

Source anchors for those characterizations: [Claude Code docs](https://code.claude.com/docs/en/how-claude-code-works), [Codex loop](https://openai.com/index/unrolling-the-codex-agent-loop/), [OpenClaw plugin docs](https://docs.openclaw.ai/plugins/sdk-agent-harness), [Hermes architecture](https://hermes-agent.nousresearch.com/docs/developer-guide/architecture), and public Pi background pieces such as [VentureBeat](https://venturebeat.com/ai/inflection-ai-launches-new-model-for-pi-chatbot-nearly-matches-gpt-4).

Two bits of design DNA are shared. First, Reactor agrees with Claude Code, OpenClaw, and Hermes that state should outlive a single model call. Claude Code has transcripts, OpenClaw has a transcript compatibility layer, Hermes has SQLite and FTS5. Reactor's difference is that the durable state is a receipt graph, not a transcript. Second, Reactor agrees with OpenClaw and Hermes that tools deserve a first-class substrate. The difference is that Reactor treats tool/effect activation as one seam and model inference as another.

The contrarian bet is the cost model. Most public harness documentation treats cost as a function of conversation length, context management, caching, provider choice, or subscription economics. Reactor says the thing worth charging for is information gain: what did the world reveal that the runtime did not already know? That bet can be wrong. If surprise is expensive or noisy to estimate in production, Reactor degenerates toward an ordinary scheduled loop with more ceremony. The v0.1 evidence does not prove the bet for the whole world. It proves the mechanism on deterministic scenarios and gives us a public harness for finding the domains where the bet holds.

The second important difference is failure posture. A chat harness can ask the user, retry, or summarize when it loses the thread. That is often humane in an interactive tool. A maintenance harness has a sharper duty: if the contract has no observable referent, or the receipt graph says the policy is stale, the correct move may be to produce a blocked receipt and surface owner-visible pressure in the local projection. Reactor's "do nothing" state is therefore not absence. Quiescence is an explicit decision with a next recheck; blockage is an explicit decision with evidence. That is why the comparison table focuses less on UI and more on where each system locates proof.

Claude Code and Codex are the best-known examples of the prompt-loop family. Their strengths are speed, tool access, and a fluid working relationship with a developer. OpenClaw and Hermes Agent are closer to a substrate story: both care deeply about tools, sessions, and durable local state. Pi is intentionally kept at the edge of the table because it marks the category boundary; a consumer assistant can have memory and personality without being an execution harness. Reactor borrows none of these systems' marketing claims. It borrows the shared insight that durable state matters, then makes a narrower claim: for maintained responsibilities, the durable state should be a causal receipt log.

## 3. Architectural Deep Dive

The architecture has two compiles, two adapter seams, and one trust unit.

The first compile is source compile: `*.prose.md` source becomes repository IR. It fires when the author changes intent. The CLI path that exercises this for examples lives under [`tools/cli`](https://github.com/openprose/prose/tree/reactor-v0.1.0-rc.2/tools/cli), and the example sources live under [`skills/open-prose/examples`](https://github.com/openprose/prose/tree/reactor-v0.1.0-rc.2/skills/open-prose/examples). The second compile is policy compile: the contract plus accumulated receipt history becomes a token-free policy registry consumed by the runtime. It fires when the world drifted from what the policy predicted, or when a fixed backstop says the policy is too old.

Those two compiles cannot merge. Source compile asks what the author declared. Policy compile asks what the cheapest correct maintenance strategy is, given the declaration and the receipt history. Source IR can remain byte-identical for months; policy can recompile twice in a day. Both artifacts are static before the kernel consumes them, but they have different clocks and different correctness tests.

The two adapter seams are equally load-bearing. `ReactorModelGatewayAdapterV0` is the raw inference socket: shallow judging, recorded replay, and batchable model calls pass through it. `ReactorAgentSdkAdapterV0` is the bounded activation socket: policy authorship and effectful activations pass through it. The public SDK requires both adapters and checks both functions at injection time in [`packages/reactor/src/sdk/index.ts`](https://github.com/openprose/prose/blob/reactor-v0.1.0-rc.2/packages/reactor/src/sdk/index.ts). Cradle's provider-parity bridge deliberately wraps a model gateway under the agent-SDK seam for policy authorship tests, rather than erasing the distinction; see [`packages/reactor-cradle/src/provider-parity`](https://github.com/openprose/prose/tree/reactor-v0.1.0-rc.2/packages/reactor-cradle/src/provider-parity).

The trust unit is the receipt. Receipt v0 records `core`, `sig`, `verdict`, `freshness`, `composition`, and `cost`; it is content-addressed through the canonical receipt hash in [`packages/reactor/src/receipt`](https://github.com/openprose/prose/tree/reactor-v0.1.0-rc.2/packages/reactor/src/receipt). The signer is honest about v0.1: omitted signer support normalizes to `scheme: "none"` with `null_reason: "no-signer-adapter-configured"`, and non-null signing is rejected by the SDK. That is less impressive than a production signer and much better than pretending one exists.

Memoization is how the cost thesis becomes mechanical. The memo key includes the contract revision, evidence receipt identities, dependency receipts, and policy namespace. If those inputs are identical, the runtime can emit a memo-hit receipt with zero fresh tokens and explicit reused work; see [`packages/reactor/src/memo`](https://github.com/openprose/prose/tree/reactor-v0.1.0-rc.2/packages/reactor/src/memo). Forecast prevents "quiet world" from becoming "never check." Evidence-age and plan-age clocks manufacture synthetic recheck turns; plan-age rechecks are allowed to break memoization because a stale policy is itself a risk. That code lives in [`packages/reactor/src/forecast`](https://github.com/openprose/prose/tree/reactor-v0.1.0-rc.2/packages/reactor/src/forecast).

Composition treats upstream receipts as evidence. A downstream responsibility does not consume "A's chat history"; it consumes A's content-addressed receipt with an acceptable signer set and a freshness predicate. Cycle detection is enforced in the kernel and composition layer, not stamped after the fact; see [`packages/reactor/src/composition`](https://github.com/openprose/prose/tree/reactor-v0.1.0-rc.2/packages/reactor/src/composition) and [`packages/reactor/src/kernel`](https://github.com/openprose/prose/tree/reactor-v0.1.0-rc.2/packages/reactor/src/kernel).

Quiescence is deliberately split into three meanings. The runtime can decide not to act because the maintained state is already up to date. It can decide not to check because the forecast says the next audit is not due. And it can decide not to check deeply because shallow evidence is sufficient under the current calibration state. v0.1 demonstrates the first two local paths and the shallow judge path. The third is designed, measured around the K1 cassette, and honestly deferred from runtime dispatch. That distinction matters: if "quiet" collapses all three meanings, a reader cannot tell whether the system saved money, skipped evidence, or hid uncertainty.

The fixed kernel backstops are what keep model-authored policy from becoming model self-permission. Policy artifacts carry falsification predicates, but the kernel does not trust those predicates to be complete. It enforces max policy age, minimum recompile interval, calibration-divergence bounds, no-anchor floors, and rollback-to-last-known-good behavior. Those are intentionally boring checks. They are also the reason we are comfortable letting a model author policy: the model writes the slow expressive artifact; deterministic code decides whether the artifact is admissible and whether it has tripped its own guard.

The loop is easier to see as a diagram.

![Figure 1. Reactor's canonical loop: predicate-tripped reconciliation, two compiles, two adapter seams, receipt output, projection, and forecasted re-entry.](figures/reactor-loop.svg)

## 4. Why This Is Co-Load-Bearing With OpenProse

Reactor needs OpenProse because the contract must be durable, human-readable, versionable, and source-controlled. A YAML file could name parameters. It would not naturally carry the responsibility as a thing a human can read, edit, review, and argue over. OpenProse makes the contract a first-class document; Reactor makes that document operational by producing receipts that cite its current revision.

OpenProse needs Reactor for the symmetric reason. Without a receipt-producing runtime, a responsibility is only a polished prompt prefix. It can say "keep this true," but nothing proves whether the system checked the right evidence, paid a reasonable cost, or stopped when the contract became undecidable. Reactor gives the language teeth.

This symbiosis is not a coincidence of design taste; it falls out of two commitments the language and the harness share. The first: intent has exactly one authored home. The `*.prose.md` contract is the single source of meaning, and everything downstream — compiled IR, policy registry, receipts, projections — is derived and reconcilable. The second: the model authors judgment, and deterministic code only bounds it. A model writes the policy and reaches the verdict; the kernel never authors judgment, it validates, schedules, records, and constrains. Reactor is the runtime where both commitments become observable at once — a receipt is, simultaneously, evidence that the derived artifacts still agree with the authored contract and evidence that the bounded kernel, not the model, decided what was admissible.

The identity split is the small detail that reveals the whole design. The OpenProse language specification defines `responsibility_id` as a tooling-minted, UUIDv7-compatible identifier that is stable for the life of the responsibility, while `contract_revision` is the content fingerprint of the current source. Both appear in receipts. Conflating them would mean that editing the contract creates a new responsibility instead of a new version of the same responsibility. Receipt verification and the SDK surfaces in the runtime package preserve the split deliberately.

The CLI/server and skills split follows from the same boundary. Skills and `*.prose.md` source carry language. The CLI and server carry harness. The model-gateway seam corresponds to the model substrate; the agent-SDK seam corresponds to bounded activations and external effects. That decomposition is not arbitrary. It is how the authored sentence stays the source of meaning while the runtime stays the source of audit.

This also explains why the "responsibility" abstraction is worth keeping distinct from "task." A task can finish. A responsibility persists through source edits, policy recompiles, fulfillment attempts, and forecast rechecks. The stable identity lets humans say "this is still the incident briefing responsibility" while the contract revision lets the runtime say "this is not the same version of the criteria." Human continuity and machine audit need different handles. Reactor is where those handles meet.

## 5. Implementation

The public v0.1.0-rc.2 surface has three parts.

First, [`@openprose/reactor`](https://www.npmjs.com/package/@openprose/reactor/v/0.1.0-rc.2) is the runtime package. Its [`package.json`](https://github.com/openprose/prose/blob/reactor-v0.1.0-rc.2/packages/reactor/package.json) exposes 11 public entrypoints: root, receipt, cost, kernel, evidence-plan, memo, forecast, SDK, policy, composition, and projection. It has zero runtime dependencies. The source reproduction path in §9 checks its package tests.

Second, [`@openprose/reactor-cradle`](https://www.npmjs.com/package/@openprose/reactor-cradle/v/0.1.0-rc.2) is the deterministic eval package. Its [`package.json`](https://github.com/openprose/prose/blob/reactor-v0.1.0-rc.2/packages/reactor-cradle/package.json) exposes 23 entrypoints across assertions, eval helpers, worlds, scenario runners, replay, policy drift/replay, release parity, and K1/K2 spikes. Its only runtime dependency is `@openprose/reactor`.

Third, the OpenProse CLI carries the local Reactor path. The CLI package is `@openprose/prose-cli` in [`tools/cli/package.json`](https://github.com/openprose/prose/blob/reactor-v0.1.0-rc.2/tools/cli/package.json). The reproduction path in §9 runs its spawned integration suite and the package-release verifiers under [`.github/scripts`](https://github.com/openprose/prose/tree/reactor-v0.1.0-rc.2/.github/scripts), including tarball import smoke tests and publish-workflow guards. The OIDC publish workflow is in [`.github/workflows/ci-reactor-package.yml`](https://github.com/openprose/prose/blob/reactor-v0.1.0-rc.2/.github/workflows/ci-reactor-package.yml).

What v0.1.0-rc.2 demonstrates:

| Surface | Demonstrated | Not claimed |
| --- | --- | --- |
| Runtime | receipt v0, kernel backstops, memoization, forecast, evidence plans, composition pins, projection tiers, export/import, cold-start policy authorship | production gateway, production oracle, production fulfillment |
| Judgment | shallow runtime judge with adapter-owned token metadata; K1 live-cassette evaluator evidence | runtime variable-depth ensemble judging or live multi-provider matrix |
| CLI | real source compile, `prose serve`, HTTP trigger ingestion, fulfillment artifacts, crash-window replay, duplicate-trigger dedupe, `prose status --tier=owner\|subscriber\|public` | hosted operation or live external side effects |
| Storage/signing | memory/filesystem parity; honest null signer | Postgres parity and cryptographic signer adapter |
| Release | `@openprose/reactor` and `@openprose/reactor-cradle` published to npm at `0.1.0-rc.2` via OIDC trusted publishing with provenance; packed-tarball flat-tokens smoke; git tag `reactor-v0.1.0-rc.2` | a hosted control plane or managed service |

The three production-equivalent layers are intentionally not smuggled into v0.1. Production ingress would authenticate external events, normalize event identities, dedupe/replay claims, enforce source budgets, and pass typed evidence to Reactor. Production fulfillment would own idempotent side effects, retries, durable claims, and operator-visible failure states. Production oracle support would expose explicit truth and evidence sockets for evaluation and operations. v0.1 proves the local harness and deterministic measurement rig, not those hosted layers.

The CLI evidence is still important because it is no longer a fixture pretending to be an application. The Wave E migration moved examples through real `prose compile`, spawned `prose serve`, HTTP trigger ingestion, Reactor receipt production, forwarded fulfillment artifacts, and `prose status` projection. The crash-window and duplicate-trigger tests are operational scars, not academic examples: they ask whether a process death or duplicate POST changes the fulfillment count. The answer in v0.1 is observable in public tests, which is the level of confidence this release should claim.

## 6. Evaluation Methodology

The cost thesis is measured through Cradle, not through prose substitutions in this report. The public baseline implementation is in [`packages/reactor-cradle/src/baselines`](https://github.com/openprose/prose/tree/reactor-v0.1.0-rc.2/packages/reactor-cradle/src/baselines), and the cost-thesis assertions live in [`packages/reactor-cradle/src/baselines/cost-thesis/__tests__/cost-thesis.test.ts`](https://github.com/openprose/prose/blob/reactor-v0.1.0-rc.2/packages/reactor-cradle/src/baselines/cost-thesis/__tests__/cost-thesis.test.ts). Two scenario tests supply the runtime evidence: W7 static cost in [`w7-static-cost.integration.test.ts`](https://github.com/openprose/prose/blob/reactor-v0.1.0-rc.2/packages/reactor-cradle/src/__tests__/w7-static-cost.integration.test.ts) and event-changing C5 in [`c5-event-changing.integration.test.ts`](https://github.com/openprose/prose/blob/reactor-v0.1.0-rc.2/packages/reactor-cradle/src/__tests__/c5-event-changing.integration.test.ts).

Each scenario compares two rows on the same schedule and the same evidence. Reactor uses runtime-produced receipts. Reactor-no-memo charges that same Reactor receipt schedule as fresh work instead of letting memo hits reuse verdicts. This is deliberately an ablation, not a market benchmark: holding the scenario, the schedule, and the per-turn work identical and removing only verdict reuse isolates exactly what memoization buys. The familiar non-Reactor alternative — a loop that re-reads the world on a fixed cadence — is discussed qualitatively in §1 and §2; the report's quantitative claim is the ablation, because the ablation is the comparison that holds a single identical per-turn token unit across every row.

The metrics are receipt count, model invocation count, fresh tokens, reused tokens, and surprise attribution. `tokens.fresh` is fresh model work. `tokens.reused` is accounted prior work reused by a memo-hit receipt. `fresh + reused` is useful for audit, but the cost claim is about fresh model work and model invocations. We do not dollarize the deterministic Cradle runs because public provider pricing varies, and `tokens_per_dollar` would require a live price oracle we do not ship in v0.1.

The no-memo row deserves special attention because it is easy to cheat accidentally. A weak control would ask a simpler question than Reactor asks, then declare Reactor cheaper. The v0.1 control does the opposite: it starts from the same runtime-produced receipt schedule and charges every token-bearing turn as fresh work. That is why the static control is `92:0`, not a hand-waved "four times the first turn." It isolates the memoization mechanism while keeping the same scenario clock and evidence shape.
K1 calibration is measured separately. The live OpenRouter recording in [`packages/reactor-cradle/src/spikes/fixtures/k1-live-recorded.json`](https://github.com/openprose/prose/blob/reactor-v0.1.0-rc.2/packages/reactor-cradle/src/spikes/fixtures/k1-live-recorded.json) captures request IDs, response IDs, latency, finish reason, token usage, and spend for three models. The cassette SHA-256 is `f64484990635a61a3dcac973a96e97d6433a576ccc297c23742d4a515e2c1868`. It proves the K1 evaluator and metadata path against a live ensemble cassette. It does not prove runtime ensemble dispatch.

## 7a. Results: The Numbers

On the static 24-hour scenario, Reactor reaches and maintains its verdict in 2 model invocations and 46 fresh tokens. The no-memo control uses 4 invocations and 92 fresh tokens — the same scenario, the same receipt schedule, with verdict reuse switched off. That is the load-bearing result: holding the work and the evidence fixed, memoization halves both the model invocations and the fresh token spend, and the fresh spend stays flat across the day instead of climbing with each scheduled turn. The deterministic scenario keeps the judge cassette and review schedule fixed: the W7 runtime path asserts the `up` verdict shape while the no-memo baseline changes the accounting architecture, not the underlying evidence world.

| Scenario | Row | Provenance | Receipts | Model invocations | Fresh | Reused | Ratio |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| Static 24h W7, `incident-briefing-static-zero` | Reactor | runtime-produced | 4 | 2 | 46 | 46 | `46:46` |
| Static 24h W7 | Reactor no memo | same receipt schedule, no reuse | 4 | 4 | 92 | 0 | `92:0` |
| Event-changing C5, `incident-briefing-periodic-surprise` | Reactor | runtime-produced | 4 | 2 | 74 | 74 | `74:74` |
| Event-changing C5 | Reactor no memo | same receipt schedule, no reuse | 4 | 4 | 148 | 0 | `148:0` |

The static per-turn audit is the cost thesis in miniature:

| Turn | Cause | Recheck | Reactor fresh | Reactor reused | Outcome |
| --- | --- | --- | ---: | ---: | --- |
| `2026-05-18T12:00:00.000Z` | real input | none | 41 | 0 | model invocation |
| `2026-05-18T12:15:00.000Z` | forecast recheck | evidence-age | 0 | 41 | memo hit |
| `2026-05-18T18:00:00.000Z` | forecast recheck | plan-age | 5 | 0 | model invocation |
| `2026-05-19T12:00:00.000Z` | forecast recheck | evidence-age | 0 | 5 | memo hit |

Two of four turns are memo hits. The memo-hit rate is 50% in this small scenario. That small sample is not a long-horizon production forecast; it is a proof of mechanism. Cost tracks surprise plus a forecast-amortized audit floor, not the wall clock alone.

The event-changing result should be read carefully. Reactor and the no-memo control both account for 148 total tokens (`74 fresh + 74 reused` versus `148 fresh + 0 reused`). Reactor's win is two fresh invocations instead of four, and a receipt trail that proves which work was reused. It is not a claim that every changing world halves total accounted tokens.

![Figure 2. Cumulative fresh model work over four scenario turns.](figures/token-work.svg)

K1's live ensemble recording is small but useful credibility evidence:

| Provider | Model | Family | Size | Latency | Finish | Usage | Spend |
| --- | --- | --- | --- | ---: | --- | ---: | ---: |
| google | `google/gemini-3.1-flash-lite-preview` | gemini | small | 1382 ms | stop | 134 in / 53 out | $0.00011300 |
| mistralai | `mistralai/mistral-small-3.2-24b-instruct` | mistral | small | 790 ms | stop | 139 in / 52 out | $0.00004371 |
| qwen | `qwen/qwen-2.5-72b-instruct` | qwen | large | 90 ms | stop | 142 in / 51 out | $0.00007152 |

Total spend was `$0.00022823` under a `$2.00` cap. The diversity floor was met: three providers, three families, and two size classes. The K1 evaluator returned a unanimous authored-anchor result with `calibrated_confidence = 1.00` in the current public cassette. This is evidence that the evaluator, cassette metadata, and diversity guard work. It is not evidence that v0.1 performs live runtime ensemble judging.

Composition has its own measured result. The E1 integration test in [`packages/reactor-cradle/src/__tests__/e1-composition.integration.test.ts`](https://github.com/openprose/prose/blob/reactor-v0.1.0-rc.2/packages/reactor-cradle/src/__tests__/e1-composition.integration.test.ts) builds an A/B/C graph through receipt pins, runs A, B, and C once, then repeats the downstream pass with the same upstream receipt and observes memo hits for B and C without calling the model gateway. The lower-level composition unit test [`composition.test.ts`](https://github.com/openprose/prose/blob/reactor-v0.1.0-rc.2/packages/reactor/src/composition/__tests__/composition.test.ts) asserts the same propagation law: a composed dependency pin causes a memo miss on changed input and a memo hit when the composed dependency pins match. That is the v0.1 graph claim: downstream receipts consume upstream receipts as evidence, and unchanged subtrees stop at memoized receipt proof.

## 7b. Results: Stories From The Build

**The measurement had to lead the prose.** We initially had a report-shaped argument before we had the measured table worth standing behind. It looked complete and felt empty. Once the Phase C numbers landed, template-shaped prose could not honestly explain them. The public anchor is the replacement artifact: hand-written assertions in [`cost-thesis.test.ts`](https://github.com/openprose/prose/blob/reactor-v0.1.0-rc.2/packages/reactor-cradle/src/baselines/cost-thesis/__tests__/cost-thesis.test.ts), not generated copy. The lesson is simple and painful: a measured argument is not the same artifact as a generated report.

**The no-memo control was wrong, and we said so.** The first no-memo number undercharged the control. It made Reactor look better for the wrong reason. The corrected public code charges no-memo from Reactor-produced receipt work in [`packages/reactor-cradle/src/baselines/no-memo`](https://github.com/openprose/prose/tree/reactor-v0.1.0-rc.2/packages/reactor-cradle/src/baselines/no-memo), and [`cost-thesis.test.ts`](https://github.com/openprose/prose/blob/reactor-v0.1.0-rc.2/packages/reactor-cradle/src/baselines/cost-thesis/__tests__/cost-thesis.test.ts) asserts `92:0`. The story changed from a flattering number to a defensible one. That is a better result.

**The duplicate-trigger bug found the right content address.** A duplicate webhook originally risked becoming two logical receipts because transport noise could enter the identity. The public CLI now derives a `triggerDedupeKey` in [`tools/cli/src/prose/responsibility-reactor.ts`](https://github.com/openprose/prose/blob/reactor-v0.1.0-rc.2/tools/cli/src/prose/responsibility-reactor.ts), and [`tools/cli/tests/prose/duplicate-trigger.test.ts`](https://github.com/openprose/prose/blob/reactor-v0.1.0-rc.2/tools/cli/tests/prose/duplicate-trigger.test.ts) asserts two identical POSTs produce one receipt and one fulfillment dispatch. Gate checks are valuable when they are allowed to find real bugs.

**Identity semantics beat checklist semantics.** During the build, a checklist line implied that responsibility identity should derive from contract revision. The language spec and the runtime disagree for a reason: `responsibility_id` is a tooling-minted, stable identity for the responsibility, while `contract_revision` is a content fingerprint carried by receipts in [`packages/reactor/src/receipt`](https://github.com/openprose/prose/tree/reactor-v0.1.0-rc.2/packages/reactor/src/receipt). That refusal matters because otherwise every source edit would silently become a new responsibility, breaking continuity exactly where Reactor is supposed to preserve it.

**Crash replay forced durability to be real.** The local CLI path could not merely pass a happy-path trigger test. [`tools/cli/tests/prose/crash-window-replay.test.ts`](https://github.com/openprose/prose/blob/reactor-v0.1.0-rc.2/tools/cli/tests/prose/crash-window-replay.test.ts) kills `prose serve` after receipt pressure lands, restarts it, and expects convergence without a duplicate fulfillment dispatch. That test is small, but it changes the claim. The receipt log is not just explanatory; it is the state the next process uses to avoid doing the wrong work twice.

**The budget guard that never fired.** The K1 live ensemble recording ran under a `$2.00` USD spend cap. Actual spend across three providers came to `$0.00022823` — roughly four orders of magnitude under the cap. The guard was never the binding constraint, and that is the point. A budget cap is cheap insurance worth having, but it is not what makes the system cheap; the run is small because the evaluator asks three models one question once, not because a limiter clamped it. Structural cost discipline and a backstop limit are different tools, and a release should be honest about which one is doing the work.

## 8. Example Use Cases

The public repo ships five CLI examples plus one flat-tokens library demo. Each runs through the same local harness shape: real source compile, local serve or deterministic runtime, receipt production, and observable status or token output.

| Example | Link | What it proves |
| --- | --- | --- |
| Release readiness | [`skills/open-prose/examples/release-readiness`](https://github.com/openprose/prose/tree/reactor-v0.1.0-rc.2/skills/open-prose/examples/release-readiness) | Predicate-tripped reconciliation for a release candidate; the spawned CLI integration lives in [`repository-cli-integration.test.ts`](https://github.com/openprose/prose/blob/reactor-v0.1.0-rc.2/tools/cli/tests/prose/repository-cli-integration.test.ts). |
| Incident briefing room | [`skills/open-prose/examples/incident-briefing-room`](https://github.com/openprose/prose/tree/reactor-v0.1.0-rc.2/skills/open-prose/examples/incident-briefing-room) | Long-lived incident state with `prose status` surprise attribution; tested by [`example-incident-briefing-room.test.ts`](https://github.com/openprose/prose/blob/reactor-v0.1.0-rc.2/tools/cli/tests/prose/example-incident-briefing-room.test.ts). |
| Customer risk radar | [`skills/open-prose/examples/customer-risk-radar`](https://github.com/openprose/prose/tree/reactor-v0.1.0-rc.2/skills/open-prose/examples/customer-risk-radar) | Customer-risk responsibility with forwarded fulfillment artifact and status attribution; tested by [`example-customer-risk-radar.test.ts`](https://github.com/openprose/prose/blob/reactor-v0.1.0-rc.2/tools/cli/tests/prose/example-customer-risk-radar.test.ts). |
| Compliance evidence tracker | [`skills/open-prose/examples/compliance-evidence-tracker`](https://github.com/openprose/prose/tree/reactor-v0.1.0-rc.2/skills/open-prose/examples/compliance-evidence-tracker) | Projection privacy and audit-evidence freshness; tested by [`example-compliance-evidence-tracker.test.ts`](https://github.com/openprose/prose/blob/reactor-v0.1.0-rc.2/tools/cli/tests/prose/example-compliance-evidence-tracker.test.ts) and [`projection-tier.test.ts`](https://github.com/openprose/prose/blob/reactor-v0.1.0-rc.2/tools/cli/tests/prose/projection-tier.test.ts). |
| Research inbox triage | [`skills/open-prose/examples/research-inbox-triage`](https://github.com/openprose/prose/tree/reactor-v0.1.0-rc.2/skills/open-prose/examples/research-inbox-triage) | Forecast-driven recheck and triage state; tested by [`example-research-inbox-triage.test.ts`](https://github.com/openprose/prose/blob/reactor-v0.1.0-rc.2/tools/cli/tests/prose/example-research-inbox-triage.test.ts). |
| Flat tokens | [`skills/open-prose/examples/flat-tokens`](https://github.com/openprose/prose/tree/reactor-v0.1.0-rc.2/skills/open-prose/examples/flat-tokens) | The literal `46:46` reproduction using `createReactor().ingest`; smoked by [`smoke-reactor-flat-tokens-example.test.mjs`](https://github.com/openprose/prose/blob/reactor-v0.1.0-rc.2/.github/scripts/smoke-reactor-flat-tokens-example.test.mjs). |

The Incident Briefing Room is the most legible operational case. The quickstart in [`tools/cli/QUICKSTART.md`](https://github.com/openprose/prose/blob/reactor-v0.1.0-rc.2/tools/cli/QUICKSTART.md) compiles the bundled source, promotes `manifest.next` to `manifest.active`, runs `prose serve`, posts an incident event, and inspects `prose status --tier=owner` and `prose status --tier=public`. The receipt log lands under `state/reactor/<responsibility-id>/receipts.json`; fulfillment evidence lands under `runs/<run-id>/fulfillment-artifact.json`.

The deterministic event-changing receipt trail has this shape, anchored by [`c5-event-changing.integration.test.ts`](https://github.com/openprose/prose/blob/reactor-v0.1.0-rc.2/packages/reactor-cradle/src/__tests__/c5-event-changing.integration.test.ts):

| Time | Cause | Evidence | Fresh/reused | What the receipt proves |
| --- | --- | --- | ---: | --- |
| `2026-05-18T12:00:00.000Z` | real input | initial incident feed | `37/0` | bootstrap judgment spent fresh work |
| `2026-05-18T12:15:00.000Z` | forecast recheck | evidence unchanged | `0/37` | evidence-age check reused the prior verdict |
| `2026-05-18T12:30:00.000Z` | real input | `incident-opened`, changed evidence hash | `37/0` | material surprise forced fresh judgment |
| `2026-05-18T12:45:00.000Z` | forecast recheck | changed evidence unchanged | `0/37` | the updated verdict was reusable |

## 9. Reproducing The Headline And Checking The Evidence

There are two reproduction paths: the npm packages for the library demo, and the public repo for the full CLI/test surface.

To reproduce the library headline from npm:

```bash
mkdir reactor-report-demo
cd reactor-report-demo
npm init -y >/dev/null
npm install @openprose/reactor@0.1.0-rc.2 @openprose/reactor-cradle@0.1.0-rc.2
git clone https://github.com/openprose/prose
cd prose
git checkout reactor-v0.1.0-rc.2
cd ..
cp prose/skills/open-prose/examples/flat-tokens/flat-tokens.example.mjs .
node flat-tokens.example.mjs
node flat-tokens.example.mjs
```

The expected output leads with the no-memo contrast and then prints the raw counters:

```
memoization cut fresh model spend 50% (2 model calls, not 4)
tokens.fresh=46
tokens.reused=46
ratio=46:46
no-memo-fresh=92
```

The run is deterministic. The ratio should match exactly on the second run, and the receipt content hashes should be byte-identical between runs. This is not a claim we are asking the reader to take on faith: independent first-time evaluators, following this recipe from clean clones, have reproduced `46:46` with identical receipt hashes — including one run repeated twenty times without drift. If your numbers do not match, the most likely causes are a non-`0.1.0-rc.2` install, copying the wrong example file, or running against a modified local checkout.

To reproduce the package and CLI suites from source:

```bash
git clone https://github.com/openprose/prose
cd prose
git checkout reactor-v0.1.0-rc.2
corepack enable
pnpm install --frozen-lockfile
pnpm build
pnpm --filter @openprose/reactor test
pnpm --filter @openprose/reactor-cradle test
pnpm --filter @openprose/prose-cli test
node --test $(find .github/scripts -name '*reactor*.test.mjs' -type f | sort)
```

Expected counts at the `reactor-v0.1.0-rc.2` tag are Reactor 155, Cradle 121, CLI 284, and release verifiers 35, all passing. (These counts are refreshed to the tagged release's green-gate before publication.) To focus on the cost thesis, run the Cradle package test and inspect the assertions in [`cost-thesis.test.ts`](https://github.com/openprose/prose/blob/reactor-v0.1.0-rc.2/packages/reactor-cradle/src/baselines/cost-thesis/__tests__/cost-thesis.test.ts), [`w7-static-cost.integration.test.ts`](https://github.com/openprose/prose/blob/reactor-v0.1.0-rc.2/packages/reactor-cradle/src/__tests__/w7-static-cost.integration.test.ts), and [`c5-event-changing.integration.test.ts`](https://github.com/openprose/prose/blob/reactor-v0.1.0-rc.2/packages/reactor-cradle/src/__tests__/c5-event-changing.integration.test.ts). The headline demo prints the `46:46` number directly; the larger table is test-backed evidence rather than a separate benchmark CLI.

To reproduce the local CLI receipt trail, follow [`tools/cli/QUICKSTART.md`](https://github.com/openprose/prose/blob/reactor-v0.1.0-rc.2/tools/cli/QUICKSTART.md). The output to look for is not just "the command succeeded." It is `prose status` showing `surprise_cause=real-input`, fresh/reused token attribution, provider/model labels, an owner projection, a public projection, and a receipt log on disk.

We do not recommend re-running K1 live by default. The committed cassette is the reproducible artifact. A live re-run will depend on current provider routing and pricing, and it should be treated as an advanced calibration exercise rather than the default reproduction path.

## 10. Limitations: What v0.1 Does Not Claim

The limitations below are stated plainly and up front; several were sharpened by independent first-contact evaluation of the release candidate before this report was finalized. None of them is hidden in a footnote, and none is a surprise to the team.

Runtime variable-depth judging is not implemented. The public judge has a shallow path; the ensemble branch is explicitly not implemented in v0.1, and runtime receipts use `calibration_grade: "none"` for shallow judgment. K1 proves a live ensemble cassette evaluator, not live runtime escalation.

The provider matrix is recorded, not live. Cradle has recorded OpenRouter and Anthropic parity for policy artifacts, and the K1 cassette includes three OpenRouter-routed providers. We do not claim direct live adapters for OpenAI, Anthropic, Gemini, Grok, and others running in every CI pass.

v0.1 ingress does not authenticate or validate external inputs. `prose serve` accepts an HTTP trigger and mints an honest content-addressed `real-input` receipt for it, but it does not yet reject malformed, empty, or wrong-content-type bodies, and it does not authenticate the producer. The receipt stays honest about what it received; production-grade ingress — authenticated sources, normalized event identity, input validation, source budgets — is named v0.2 scope. A v0.1 deployment should not expose `prose serve` to arbitrary public webhook producers.

v0.1 is not a high-volume, long-running harness. Memoization keeps the token cost surprise-shaped at scale — a static scenario driven through thousands of events still resolves to a single model invocation — but latency is not flat: memo lookup scans the receipt log, and the log is rewritten whole on each append. For long-lived, high-frequency responsibilities this needs a memo index and log compaction or segmentation. The cost thesis holds; the v0.1 storage engine is honestly a v0.1 storage engine.

The long-horizon evidence is synthetic. W7 and C5 are useful because they are deterministic and inspectable. They are not a 30-day production incident run. The next version needs real-world calendars, changing evidence streams, and scar tissue from actual operators.

Postgres parity is deferred. The v0.1 Reactor storage adapter is synchronous; real Postgres IO is async. Rather than flattening that mismatch, the release keeps memory/filesystem parity and names Postgres as a future adapter row.

The signer is null, and the trail is tamper-evident rather than non-repudiable. Receipts with `scheme: "none"` and `null_reason: "no-signer-adapter-configured"` are honest local artifacts, not cross-organization attestations. The content hash makes a receipt self-verifying: accidental corruption of a stored receipt is caught, and any field changed without recomputing the hash is rejected. But with no signer the receipt is not an attestation of *who* produced it, and the receipt log is not a hash chain — so an actor with write access to the state directory can re-hash a modified receipt, or drop one, undetected. v0.1 receipts are an honest integrity record, not yet a non-repudiable, compliance-grade audit trail. Relatedly, a receipt names its evidence by content hash but does not retain the raw evidence bytes; a raw-evidence store, a real signer adapter, and tamper-evident (hash-chained or append-only) receipt storage are all future work.

The risky bet remains cost-scales-with-surprise. Some domains do not have a cheap complete hash for "semantically relevant content changed." Some have no reliable correctness anchor. In those domains Reactor can still be safer than an opaque loop because it emits receipts and limitations, but the cost differentiator weakens toward scheduled checking.

## 11. What's Next

The next engineering line is variable-depth runtime judging: shallow by default, deeper when uncertainty, stakes, calibration drift, or policy requires it. That means wiring the K1-style evidence into the runtime decision path rather than leaving it as an eval spike.

The next adapter line is production-equivalent ingress, fulfillment, and oracle support. Ingress needs authenticated event sources, normalized event identity, replayable claims, and budget controls. Fulfillment needs idempotent side effects, durable dispatch claims, retry policy, and operator-visible failure modes. Oracle support needs explicit truth/evidence sockets, not ambient knowledge smuggled into tests.

The next developer-experience line is a higher-level embedding surface. The v0.1 SDK is deliberately explicit — every adapter is injected, nothing is defaulted — which is correct for a runtime but high-ceremony for a first integration. A typed event surface and a higher-level "I have an event and a judge" quickstart are v0.2 DX work; the `*.prose.md` author surface is unaffected.

The next evidence line is longer horizon and broader provider coverage: 7/30/90-day scenarios, direct provider adapters, Postgres parity, and a real signer. The issue tracker for this work is [`openprose/prose/issues`](https://github.com/openprose/prose/issues).

The most valuable contribution is not a benchmark that makes Reactor look good. It is a responsibility and an evaluation where the harness should pass but does not yet. The architecture is opinionated. Receipts over transcripts, policy compile over prompt convention, two seams over one, surprise over time, predicates over prompts. Some of those opinions will be wrong in some domains. The way we find out is to run real responsibilities, keep the receipt trail, and publish the corrections.
